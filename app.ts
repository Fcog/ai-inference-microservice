import express, { Request, Response } from 'express';
import { createInferenceContext, InferenceContext } from './inference/inference-context';
import { UnknownProviderError } from './inference/inference-strategy';

export function createApp(inference: InferenceContext = createInferenceContext()): express.Express {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).send({ status: 'healthy' });
  });

  app.post('/predict', async (req: Request, res: Response) => {
    const { prompt, provider } = req.body ?? {};
    if (typeof prompt !== 'string' || prompt.trim() === '') {
      return res.status(400).json({ error: 'Field `prompt` must be a non-empty string' });
    }
    if (provider !== undefined && typeof provider !== 'string') {
      return res.status(400).json({ error: 'Field `provider` must be a string' });
    }

    try {
      const completion = await inference.complete(prompt, provider);
      res.json(completion);
    } catch (error) {
      if (error instanceof UnknownProviderError) {
        return res.status(400).json({ error: error.message });
      }
      console.error('Inference failed:', error);
      res.status(500).json({ error: 'Inference failed' });
    }
  });

  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT ?? 3000);
  createApp().listen(port, () => console.log(`AI Service running on port ${port}`));
}
