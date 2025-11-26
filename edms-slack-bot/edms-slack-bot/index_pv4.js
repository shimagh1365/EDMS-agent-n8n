// index.js
const { App } = require("@slack/bolt");
require("dotenv").config();
const googleSheetsClient = require("./googleSheetsClient");
const getSheetData = googleSheetsClient.getSheetData;
const axios = require("axios");
const OpenAI = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MASTER_DATA_SHEET_ID = process.env.MASTER_DATA_SHEET_ID;
const USER_DIRECTORY_SHEET_ID = process.env.USER_DIRECTORY_SHEET_ID;

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
});

const userDataStore = {};

const S = {
  ASKING_ENTITY: "ASKING_ENTITY",
  ASKING_DEPARTMENT: "ASKING_DEPARTMENT",
  ASKING_TYPE: "ASKING_TYPE",
  ASKING_PROJECT: "ASKING_PROJECT",
  ASKING_STATUS: "ASKING_STATUS",
  ASKING_SUBJECT: "ASKING_SUBJECT",
  ASKING_OBJECTIVE: "ASKING_OBJECTIVE",
  ASKING_BACKGROUND: "ASKING_BACKGROUND",
  ASKING_KEYPOINTS: "ASKING_KEYPOINTS",
  ASKING_USERNAME: "ASKING_USERNAME",
  ASKING_APPROVER: "ASKING_APPROVER",
  ASKING_REVIEWER: "ASKING_REVIEWER",
  ASKING_INFO: "ASKING_INFO",
  COMPLETE: "COMPLETE"
};

// Generic dropdown converter
function createSlackOptions(rows, valueColumnIndex = 0, textColumnIndex = 0) {
  return rows.slice(1)
    .filter(row => row[valueColumnIndex] && row[valueColumnIndex].trim() !== "")
    .map(row => ({
      text: { type: "plain_text", text: (row[textColumnIndex] || '').trim() },
      value: (row[valueColumnIndex] || '').trim(),
    }));
}


// ✅ Load USER DIRECTORY and return name → approver/reviewer/info
async function getUserDirectoryData() {
  const rows = await getSheetData(USER_DIRECTORY_SHEET_ID, "Sheet1!A1:F");
  const [header, ...data] = rows;
  return data.map(row => {
    let obj = {};
    header.forEach((key, i) => obj[key.trim()] = (row[i] || "").trim());
    return obj;
  });
}

// ✅ Lookup user by NAME (not email)
async function findUserByName(name) {
  try {
    const users = await getUserDirectoryData();
    const clean = name.trim().toLowerCase();

    const match = users.find(u =>
      (u["UserName"] || "").trim().toLowerCase() === clean
    );

    if (!match) {
      return {
        approver: "Not found",
        reviewer: "Not found",
        infoEmail: "Not found"
      };
    }

    return {
      approver: match["DefaultApprover"] || "Not found",
      reviewer: match["DefaultReviewer"] || "Not found",
      infoEmail: match["DefaultInfo"] || "Not found"
    };

  } catch (err) {
    console.error("Lookup error:", err);
    return {
      approver: "ERROR",
      reviewer: "ERROR",
      infoEmail: "ERROR"
    };
  }
}

async function generateOpenAIDocument(u) {
  const prompt = `
Generate a professional document with the following fields:

Entity: ${u.entity}
Department: ${u.department}
Type: ${u.type}
Project: ${u.project}
Status: ${u.status}
Title: ${u.subject}
Objective: ${u.objective}
Background: ${u.background}
Key Points: ${u.keyPoints}
Approver: ${u.approver}
Reviewer: ${u.reviewer}
Info Person: ${u.infoEmail}

Format it as a clean business document with clear sections, bullet points, and professional tone.
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are a document generation assistant that produces professional output." },
      { role: "user", content: prompt }
    ]
  });

  return response.choices[0].message.content;
}


// ✅ 1. start → ENTITY dropdown
app.message("start", async ({ message, say }) => {
  try {
    const userId = message.user;

    const entityRows = await getSheetData(MASTER_DATA_SHEET_ID, "EntityName!A1:A");
    const entityOptions = createSlackOptions(entityRows, 0, 0);

    userDataStore[userId] = { step: S.ASKING_ENTITY, userId };

    await say({
      text: "Please choose Entity",
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: "*1. Choose Entity Name:*" },
          accessory: {
            type: "static_select",
            action_id: "entity_name_selected",
            placeholder: { type: "plain_text", text: "Select Entity" },
            options: entityOptions
          }
        }
      ]
    });
  } catch (err) {
    console.error(err);
    await say("Error starting.");
  }
});

// ✅ 2. Entity selected → DEPARTMENT dropdown
app.action("entity_name_selected", async ({ ack, body, say }) => {
  await ack();
  try {
    const userId = body.user.id;
    userDataStore[userId].entity = body.actions[0].selected_option.value;
    userDataStore[userId].step = S.ASKING_DEPARTMENT;

    const deptRows = await getSheetData(MASTER_DATA_SHEET_ID, "Department!A1:A");
    const deptOptions = createSlackOptions(deptRows);

    await say({
      text: "Select department",
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: "🏛️ *2. Choose Department:*" },
          accessory: {
            type: "static_select",
            action_id: "department_selected",
            placeholder: { type: "plain_text", text: "Select Department" },
            options: deptOptions
          }
        }
      ]
    });

  } catch (err) {
    console.error("Error dept:", err);
    await say("Error selecting department.");
  }
});

// ✅ 3. Department → Document Type dropdown
app.action("department_selected", async ({ ack, body, say }) => {
  await ack();
  try {
    const userId = body.user.id;
    userDataStore[userId].department = body.actions[0].selected_option.value;
    userDataStore[userId].step = S.ASKING_TYPE;

    const typeRows = await getSheetData(MASTER_DATA_SHEET_ID, "DocumentType!A1:A");
    const typeOptions = createSlackOptions(typeRows);

    await say({
      text: "Choose document type",
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: "*3. Choose Document Type:*" },
          accessory: {
            type: "static_select",
            action_id: "type_selected",
            placeholder: { type: "plain_text", text: "Select Type" },
            options: typeOptions
          }
        }
      ]
    });

  } catch (err) {
    console.error(err);
  }
});

// ✅ 4. Document Type → Project dropdown
app.action("type_selected", async ({ ack, body, say }) => {
  await ack();
  const userId = body.user.id;
  userDataStore[userId].type = body.actions[0].selected_option.value;
  userDataStore[userId].step = S.ASKING_PROJECT;

  const projectRows = await getSheetData(MASTER_DATA_SHEET_ID, "Project!A1:A");
  const projectOptions = createSlackOptions(projectRows);

  await say({
    text: "Select project",
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: "*4. Choose Project:*" },
        accessory: {
          type: "static_select",
          action_id: "project_selected",
          placeholder: { type: "plain_text", text: "Select Project" },
          options: projectOptions
        }
      }
    ]
  });
});

// ✅ 5. Project → Status dropdown
app.action("project_selected", async ({ ack, body, say }) => {
  await ack();
  const userId = body.user.id;
  userDataStore[userId].project = body.actions[0].selected_option.value;
  userDataStore[userId].step = S.ASKING_STATUS;

  const statusRows = await getSheetData(MASTER_DATA_SHEET_ID, "DocStatus!A1:A");
  const statusOptions = createSlackOptions(statusRows);

  await say({
    text: "Select status",
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: "*5. Choose Document Status:*" },
        accessory: {
          type: "static_select",
          action_id: "status_selected",
          placeholder: { type: "plain_text", text: "Select Status" },
          options: statusOptions
        }
      }
    ]
  });
});

// ✅ 6. Status → Ask Title
app.action("status_selected", async ({ ack, body, say }) => {
  await ack();
  const userId = body.user.id;
  userDataStore[userId].status = body.actions[0].selected_option.value;
  userDataStore[userId].step = S.ASKING_SUBJECT;

  await say("📝 What is the *Title*?");
});

// ✅ 7. Approver selected → Reviewer dropdown
app.action("approver_selected", async ({ ack, body, say }) => {
  await ack();
  const userId = body.user.id;

  userDataStore[userId].approver = body.actions[0].selected_option.value;
  userDataStore[userId].step = S.ASKING_REVIEWER;

  await say({
    text: "Select reviewer",
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: "*Select Reviewer:*" },
        accessory: {
          type: "static_select",
          action_id: "reviewer_selected",
          placeholder: { type: "plain_text", text: "Choose Reviewer" },
          options: userDataStore[userId].reviewerOptions
        }
      }
    ]
  });
});

// ✅ 8. Reviewer selected → Info Person dropdown
app.action("reviewer_selected", async ({ ack, body, say }) => {
  await ack();
  const userId = body.user.id;

  userDataStore[userId].reviewer = body.actions[0].selected_option.value;
  userDataStore[userId].step = S.ASKING_INFO;

  await say({
    text: "Select info person",
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: "*Select Info Person:*" },
        accessory: {
          type: "static_select",
          action_id: "info_selected",
          placeholder: { type: "plain_text", text: "Choose Info Email" },
          options: userDataStore[userId].infoOptions
        }
      }
    ]
  });
});

// ✅ 9. Info selected → Generate AI document + show preview + ask Yes/No
app.action("info_selected", async ({ ack, body, say }) => {
  await ack();
  const userId = body.user.id;

  userDataStore[userId].infoEmail = body.actions[0].selected_option.value;
  userDataStore[userId].step = S.COMPLETE;

  const u = userDataStore[userId];

  await say("🧠 Generating document with AI... please wait 10–15 seconds.");

  const aiDocument = await generateOpenAIDocument(u);
  console.log("✅ Document generated for:", userId);
  console.log("Storing document for user:", userId);

  u.generatedDocument = aiDocument;

  const chunks = aiDocument.match(/[\s\S]{1,2800}/g) || ["No content generated."];

  for (let i = 0; i < chunks.length; i++) {
    await say({
      text: "Generated document preview",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `📄 *Generated Document (Part ${i + 1}/${chunks.length}):*\n\`\`\`${chunks[i]}\`\`\``
          }
        }
      ]
    });
  }

  await say({
    text: "Do you want to proceed?",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Do you want to proceed to generate and send to the workflow?`
        }
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "✅ Yes, Proceed" },
            style: "primary",
            value: "yes",
            action_id: "confirm_yes"
          },
          {
            type: "button",
            text: { type: "plain_text", text: "❌ No, Restart" },
            style: "danger",
            value: "no",
            action_id: "confirm_no"
          }
        ]
      }
    ]
  });
});

// ✅ YES clicked → send data to N8N
app.action("confirm_yes", async ({ ack, body, say }) => {
  await ack();

  const userId = body.user.id;
  const u = userDataStore[userId];

  if (!u || !u.generatedDocument) {
    await say("⚠️ No generated document found. Please restart by typing *start*.");
    return;
  }

  await say("📤 Sending data to workflow...");
  console.log("📨 Sending data for:", userId, "Has document:", !!u.generatedDocument);

  try {
    await axios.post("https://shimaghasemi11.app.n8n.cloud/webhook-test/edms/chat", {
      fullDocument: u.generatedDocument,
      entity: u.entity,
      department: u.department,
      type: u.type,
      project: u.project,
      status: u.status,
      subject: u.subject,
      objective: u.objective,
      background: u.background,
      keyPoints: u.keyPoints,
      approver: u.approver,
      reviewer: u.reviewer,
      infoEmail: u.infoEmail,
      userName: u.userName
    });

    await say("✅ Data sent to workflow. Document will be generated and emails will be sent.");
  } catch (err) {
    console.error("Error sending to N8N:", err);
    await say("⚠️ Error sending to workflow.");
  }

  delete userDataStore[userId];
});

// ✅ NO clicked → restart process
app.action("confirm_no", async ({ ack, body, say }) => {
  await ack();
  const userId = body.user.id;
  delete userDataStore[userId];
  await say("🔄 Restarting... Type *start* to begin again.");
});

// UNIVERSAL message input handler
app.message(async ({ message, say }) => {
  const userId = message.user;
  const text = message.text.trim();
  const u = userDataStore[userId];

  if (!u || !u.step || text.toLowerCase() === "start") return;

  switch (u.step) {
    case S.ASKING_SUBJECT:
      u.subject = text;
      u.step = S.ASKING_OBJECTIVE;
      await say("🎯 What is the *objective*?");
      break;

    case S.ASKING_OBJECTIVE:
      u.objective = text;
      u.step = S.ASKING_BACKGROUND;
      await say("📚 Provide some *background*:");
      break;

    case S.ASKING_BACKGROUND:
      u.background = text;
      u.step = S.ASKING_KEYPOINTS;
      await say("📌 Provide *Key Points* (line breaks allowed):");
      break;

    case S.ASKING_KEYPOINTS:
      u.keyPoints = text;
      u.step = S.ASKING_USERNAME;
      await say("👤 Enter your *Name* (exact as in the sheet):");
      break;

    case S.ASKING_USERNAME:
      u.userName = text;

      await say("🔍 Looking up defaults...");

      const users = await getUserDirectoryData();

      const approverList = users
        .map(r => r["DefaultApprover"])
        .filter(v => v && v.trim() !== "")
        .map(email => ({
          text: { type: "plain_text", text: email },
          value: email
        }));

      const reviewerList = users
        .map(r => r["DefaultReviewer"])
        .filter(v => v && v.trim() !== "")
        .map(email => ({
          text: { type: "plain_text", text: email },
          value: email
        }));

      const infoList = users
        .map(r => r["DefaultInfo"])
        .filter(v => v && v.trim() !== "")
        .map(email => ({
          text: { type: "plain_text", text: email },
          value: email
        }));

      u.approverOptions = approverList;
      u.reviewerOptions = reviewerList;
      u.infoOptions = infoList;

      u.step = S.ASKING_APPROVER;

      await say({
        text: "Select approver",
        blocks: [
          {
            type: "section",
            text: { type: "mrkdwn", text: "*Select Approver:*" },
            accessory: {
              type: "static_select",
              action_id: "approver_selected",
              placeholder: { type: "plain_text", text: "Choose Approver" },
              options: approverList
            }
          }
        ]
      });

      break;
  }
});

// ✅ Start app
(async () => {
  await app.start(process.env.PORT || 3000);
  console.log("⚡️ Slack bot is running!");
})();
