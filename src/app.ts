import express from "express";
import dotenv from "dotenv";
import identifyRoutes from "./routes/identify";

dotenv.config();

const app = express();
app.use(express.json());

app.use("/", identifyRoutes);

export default app;
