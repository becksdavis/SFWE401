const getDB = require("./db");

(async () => {
    const db = await getDB();

    await db.dropDatabase();
    console.log("Database reset!");

    process.exit();
})();
