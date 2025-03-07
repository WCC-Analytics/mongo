/*
 * Test that $merge is correctly targeted to a shard that owns data if output collection is
 * unsplittable.
 * @tags: [
 *   featureFlagTrackUnshardedCollectionsOnShardingCatalog,
 *   featureFlagUnsplittableCollectionsOnNonPrimaryShard,
 *   multiversion_incompatible,
 *   assumes_balancer_off,
 * ]
 */

import {CreateShardedCollectionUtil} from "jstests/sharding/libs/create_sharded_collection_util.js";

const kDbName = "merge_targeting";

const st = new ShardingTest({shards: 3});
const db = st.s.getDB(kDbName);
const shard0 = st.shard0.shardName;
const shard1 = st.shard1.shardName;
const shard2 = st.shard2.shardName;

assert.commandWorked(db.adminCommand({enableSharding: kDbName, primaryShard: shard0}));

const kShardedCollName = "sharded";
const shardedColl = db[kShardedCollName];
shardedColl.createIndex({i: 1}, {unique: true});
CreateShardedCollectionUtil.shardCollectionWithChunks(shardedColl, {i: 1}, [
    {min: {i: MinKey}, max: {i: 3}, shard: shard0},
    {min: {i: 3}, max: {i: 6}, shard: shard1},
    {min: {i: 6}, max: {i: MaxKey}, shard: shard2}
]);

const kUnsplittable1CollName = "unsplittable_1";
assert.commandWorked(
    db.runCommand({createUnsplittableCollection: kUnsplittable1CollName, dataShard: shard1}));
const coll1 = db[kUnsplittable1CollName];
assert.commandWorked(coll1.createIndex({i: 1}, {unique: true}));

const kUnsplittable2CollName = "unsplittable_2";
assert.commandWorked(
    db.runCommand({createUnsplittableCollection: kUnsplittable2CollName, dataShard: shard2}));
const coll2 = db[kUnsplittable2CollName];
assert.commandWorked(coll2.createIndex({i: 1}, {unique: true}));

const kUnsplittable3CollName = "unsplittable_3";
assert.commandWorked(
    db.runCommand({createUnsplittableCollection: kUnsplittable3CollName, dataShard: shard1}));
const coll3 = db[kUnsplittable3CollName];
assert.commandWorked(coll3.createIndex({i: 1}, {unique: true}));

function getExpectedData(collName) {
    const data = [];
    for (let i = 0; i < 10; ++i) {
        data.push({"i": i, "original_coll": collName});
    }
    return data;
}

function resetData(coll) {
    assert.commandWorked(coll.deleteMany({}));
    assert.commandWorked(coll.insertMany(getExpectedData(coll.getName())));
}

function testMerge(sourceColl, destColl, expectedMergeShardId, expectedShards) {
    resetData(sourceColl);
    resetData(destColl);

    const pipeline = [
        {$project: {_id: 0}},
        {$merge: {into: destColl.getName(), on: "i", whenMatched: "replace"}}
    ];
    const explain = sourceColl.explain().aggregate(pipeline);
    assert.eq(explain.mergeShardId, expectedMergeShardId, tojson(explain));
    assert.eq(Object.getOwnPropertyNames(explain.shards).sort(), expectedShards, tojson(explain));

    sourceColl.aggregate(pipeline);
    const data = destColl.find({}, {_id: 0}).sort({i: 1}).toArray();
    assert.eq(data, getExpectedData(sourceColl.getName()));
}

testMerge(coll1, coll2, "merge_targeting-rs2", ["merge_targeting-rs1"]);
testMerge(coll1, coll3, undefined, ["merge_targeting-rs1"]);
testMerge(shardedColl,
          coll1,
          "merge_targeting-rs1",
          ["merge_targeting-rs0", "merge_targeting-rs1", "merge_targeting-rs2"]);
testMerge(coll1, shardedColl, undefined, ["merge_targeting-rs1"]);

function testDocumentsTargeting() {
    const expectedData = getExpectedData("documents");
    const pipeline = [
        {$documents: expectedData},
        {$merge: {into: coll3.getName(), on: "i", whenMatched: "replace"}}
    ];
    const explain = db.aggregate(pipeline, {explain: true});
    assert.eq(Object.getOwnPropertyNames(explain.shards), ["merge_targeting-rs1"], tojson(explain));

    db.aggregate(pipeline);
    const data = coll3.find({}, {_id: 0}).sort({i: 1}).toArray();
    assert.eq(data, expectedData);
}
testDocumentsTargeting();

st.stop();
