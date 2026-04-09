import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import nodemailer from "nodemailer";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  // API Route for sending a SINGLE email (used by frontend loop)
  app.post("/api/send-email", async (req, res) => {
    const { credentials, to, subject, html } = req.body;

    if (!credentials || !credentials.email || !credentials.password) {
      return res.status(400).json({ error: "Email credentials are required." });
    }

    if (!to || !subject || !html) {
      return res.status(400).json({ error: "Missing email parameters (to, subject, html)." });
    }

    try {
      // Create a transporter using the provided credentials
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: credentials.email,
          pass: credentials.password, // App Password
        },
      });

      const info = await transporter.sendMail({
        from: `"${credentials.name || credentials.email}" <${credentials.email}>`,
        to: to,
        subject: subject,
        html: html,
      });

      res.json({
        success: true,
        messageId: info.messageId,
      });
    } catch (error: any) {
      console.error(`Failed to send to ${to} via ${credentials.email}:`, error);
      res.status(500).json({ error: error.message || "Failed to authenticate or send email." });
    }
  });

  // Catch-all for API routes to prevent falling through to SPA index.html
  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: `API route not found or wrong method: ${req.method} ${req.path}` });
  });

  // Global error handler to ensure JSON responses for API errors (like payload too large)
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.path.startsWith('/api/')) {
      res.status(err.status || 500).json({ error: err.message || "Internal Server Error" });
    } else {
      next(err);
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

