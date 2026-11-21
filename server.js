import { app } from "./app.js";
import 'dotenv/config';
import { connectDB } from "./config/mongoConnection.js";

const PORT = process.env.PORT || 5000;

app.get("/", (req, res) => {
    res.send("server is working fine!");
});

// Connect to database
connectDB();

// Start server
app.listen(PORT, () => {
    console.clear();
    console.log(`🚀 Server running on http://localhost:${PORT} ✅`);
    console.log(`📚 API Documentation: http://localhost:${PORT}/api/v1/api-docs`);
    console.log(`🔐 Universal Login: http://localhost:${PORT}/api/v1/auth/login`);
});