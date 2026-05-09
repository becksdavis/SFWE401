const { MongoClient } = require("mongodb");

const client = new MongoClient("mongodb://localhost:27017");

async function getDB() {
    if (!client.topology || !client.topology.isConnected()) {
        await client.connect();
    }
    return client.db("storeDB");
}

module.exports = getDB;
