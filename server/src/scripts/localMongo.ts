import { MongoMemoryServer } from "mongodb-memory-server";

async function main() {
  const mongod = await MongoMemoryServer.create({
    instance: {
      port: 27018,
      dbName: "renta",
      ip: "127.0.0.1",
    },
  });

  console.log("LOCAL_MONGO_READY", mongod.getUri());
  await new Promise(() => {});
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
