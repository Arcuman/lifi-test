const admin = db.getSiblingDB("admin");

try {
  const status = admin.runCommand({ replSetGetStatus: 1 });
  if (status.ok === 1) {
    quit(0);
  }
} catch {
  // Replica set is not initialized yet; continue with rs.initiate.
}

const config = {
  _id: "rs0",
  members: [{ _id: 0, host: "mongo:27017" }]
};

const result = admin.runCommand({ replSetInitiate: config });
if (result.ok !== 1) {
  printjson(result);
  quit(1);
}

quit(0);
