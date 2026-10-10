import express, { Request, Response } from "express";

const app = express();
app.use(express.json());

app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({ status: "processor-healthy" });
});

app.post("/process", (req: Request, res: Response) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "Text field required" });

  // Simulate light text processing / token metrics computation
  const characterCount = text.length;
  const wordCount = text.split(/\s+/).length;

  res.json({
    service: "data-processor",
    metrics: { words: wordCount, characters: characterCount },
    timestamp: new Date().toISOString(),
  });
});

app.listen(4000, () =>
  console.log("Data Processor Service active on port 4000"),
);
