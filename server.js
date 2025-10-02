import { app } from "./app.js";
import  'dotenv/config'
import { connectDB } from "./config/mongoConnection.js";

const PORT = process.env.PORT
app.get("/", (req, res) => {
    res.send("server is working fine!");
  });
connectDB()

  app.listen(PORT, () => {
    console.clear();
    console.log(`http://localhost:${process.env.PORT} ✅`);
  });