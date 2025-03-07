// Tests that _id will exist in all updated docs.
//
// @tags: [
//   # The test runs commands that are not allowed with security token: godinsert.
//   not_allowed_with_security_token,
//   # Cannot implicitly shard accessed collections because of following errmsg: A single
//   # update/delete on a sharded collection must contain an exact match on _id or contain the shard
//   # key.
//   assumes_unsharded_collection,
//   requires_non_retryable_commands
// ]

let t = db.jstests_updatem;
t.drop();

// new _id from insert (upsert:true)
t.update({a: 1}, {$inc: {b: 1}}, true);
var doc = t.findOne({a: 1});
assert(doc["_id"], "missing _id");

// new _id from insert (upsert:true)
t.update({a: 1}, {$inc: {b: 1}}, true);
var doc = t.findOne({a: 1});
assert(doc["_id"], "missing _id");

// no _id on existing doc
t.getDB().runCommand({godinsert: t.getName(), obj: {a: 2}});
t.update({a: 2}, {$inc: {b: 1}}, true);
var doc = t.findOne({a: 2});
assert(doc["_id"], "missing _id after update");
