import dotenv from "dotenv";
import sqlite from "sqlite3";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";

dotenv.config();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI });
const db = new sqlite.Database("./data.sqlite");

const name = "qwen/qwen3-235b-a22b-thinking-2507";
// const name = "gemini-2.5-flash";
const isGemini = false;
const requestLimit = 60;
const sleepTime = 2;

const sendMessageOR = async (data, model, key = process.env.OPENROUTER) => {
  const messages = [
    {
      role: "user",
      content: `You are a security analysis assistant. Your job is to review code for vulnerabilities and security risks.
Analyze the following code for security vulnerabilities.

- Only answer "Safe" if there are no security vulnerabilities.
- Otherwise, answer "Vulnerable".
- Do not rewrite the code or provide explanations unless explicitly asked.

Code:
\`\`\`
${data.code}
\`\`\``,
    },
  ];

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        reasoning: { enabled: true },
      }),
    },
  );

  const result = await response.json();

  console.log(result);

  return {
    id: data.id,
    expected: "Vulnerable",
    received: result.choices[0].message.content,
    numTokensInput: result.usage.prompt_tokens,
    numTokensOutput: result.usage.completion_tokens,
    numTokensThought: result.usage.completion_tokens_details.reasoning_tokens,
  };
};

const sendMessageGemini = async (data, model) => {
  const message = `Analyze the following functions: ${data.names} written in c programming language for vulnerabilities.

Rules:
- Return exactly one word: "Safe" or "Vulnerable".
- Do not explain your answers.
- Do not rewrite the code.
- Do not add any extra text.
Code:
      \`\`\`
      ${data.code}
      \`\`\``;

  const response = await ai.models.generateContent({
    model: model,
    contents: message,
  });

  return {
    id: data.id,
    expected: "Safe",
    received: response.text.replace(/\n/g, ""),
    numTokensInput: response.usageMetadata.promptTokenCount,
    numTokensOutput: response.usageMetadata.candidatesTokenCount,
    numTokensThought: response.usageMetadata.thoughtsTokenCount,
  };
};

const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const path = `./results/${name.replace(/[<>:"/\\|?*]/g, "")}-CONTEXT.json`;
let prevResults;

if (fs.existsSync(path)) {
  const data = fs.readFileSync(path);
  prevResults = JSON.parse(data);
} else {
  prevResults = [];
}

const checkedIds = prevResults.map((val) => {
  return val.id;
});

const whereClause = checkedIds.length
  ? `WHERE id NOT IN (${checkedIds.join(",")}) and  id > 20`
  : "where id > 20";

const promises = [];

db.all(
  `SELECT * FROM data ${whereClause} LIMIT ${requestLimit}`,
  async (err, rows) => {
    if (err) return console.error(err.message);
    for (const data of rows) {
      if (isGemini) {
        promises.push(
          sendMessageGemini(data, name).catch((err) => {
            console.error("Error", err.message);
            return null;
          }),
        );
      } else {
        promises.push(
          sendMessageOR(data, name).catch((err) => {
            console.error("Error", err.message);
            return null;
          }),
        );
      }

      await sleep(sleepTime * 1000);
    }

    Promise.all(promises).then((currResults) => {
      const combined = [
        ...prevResults,
        ...currResults.filter((item) => item !== null),
      ];
      fs.writeFileSync(path, JSON.stringify(combined));
    });
  },
);
