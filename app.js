import express from "express";
import Ajv from "ajv";
import axios from "axios";
import bodyParser from "body-parser";
const app = express();
app.use(bodyParser.json());
const ajv = new Ajv();

export function convertText(textObj) {
  return {
    type: "text",
    text: textObj.payload.message,
    buttons: [],
  };
}

export function convertImage(imageObj) {
  return {
    type: "image",
    url: imageObj.payload.image,
    buttons: [],
  };
}

export function convertUrlButton(buttonObj) {
  return {
    type: "url",
    caption: buttonObj.name,
    url: buttonObj.request.payload.actions[0].payload.url,
    webview_size: "full",
  };
}

export function convertCardElement(cardObj) {
  const buttons = [];
  let actionUrl = null;

  console.log(cardObj);
  if (cardObj.buttons) {
    cardObj.buttons.forEach((button) => {
      if (button.request.payload.actions[0].type.includes("url")) {
        buttons.push(convertUrlButton(button));
        if (!actionUrl) {
          actionUrl = button.request.payload.actions[0].payload.url;
        }
      }
    });
  }
  return {
    title: cardObj.title,
    subtitle: cardObj.description?.text,
    image_url: cardObj.imageUrl,
    action_url: actionUrl,
    buttons: buttons,
  };
}

export function convertCard(cardObj) {
  return {
    type: "cards",
    elements: [convertCardElement(cardObj)],
    image_aspect_ratio: "horizontal",
  };
}

export function convertCarousel(carouselObj) {
  return {
    type: "cards",
    elements: carouselObj.payload.cards.map((el) => convertCardElement(el)),
    image_aspect_ratio: "horizontal",
  };
}

export function convertChoices(choiceObj, contentId) {
  return (choiceObj.payload?.buttons ?? []).map((button) => {
    return {
      type: "flow",
      caption: button.name,
      target: contentId,
    };
  });
}

async function checkIfUserHasStarted(userId, voiceflowKey) {
  const response = await axios(
    `https://general-runtime.voiceflow.com/state/user/${userId}`,
    {
      method: "GET",
      headers: {
        Authorization: voiceflowKey,
      },
    },
  );
  return "stack" in response.data;
}

function convertVoiceflowResponseToManyChat(
  voiceflowResponses,
  showQuickReplies,
  showReplySuggestions,
  platform,
  contentId,
) {
  const messages = [];
  const quick_replies = [];
  voiceflowResponses.forEach((response) => {
    const { type, ...payload } = response;
    if (type === "text") {
      messages.push(convertText(payload));
    } else if (type === "visual") {
      messages.push(convertImage(payload));
    } else if (type === "cardv2") {
      messages.push(convertCard(payload));
    } else if (type === "carousel") {
      messages.push(convertCarousel(payload));
    } else if (type === "choice") {
      const choices = convertChoices(payload, contentId);
      if (showQuickReplies) {
        quick_replies.push(
          ...choices.filter((choice) => choice.caption.length <= 20),
        );
      }
      const allViableReplies = choices.map((r) => r.caption);
      if (allViableReplies.length && showReplySuggestions) {
        const text = `
              Please reply with one of the following:
    - ${allViableReplies.join("\n  - ")}
            `;
        messages.push({
          type: "text",
          text: text,
        });
      }
    }
  });
  if (showQuickReplies && quick_replies.length > 0) {
    if (messages[messages.length - 1].type != "text") {
      messages.push({
        type: "text",
        text: "What else would you like to do?",
      });
    }
  }
  const response = {
    version: "v2",
    content: {
      messages: messages,
      quick_replies: quick_replies,
    },
  };

  if (platform && platform != "facebook") {
    response["type"] = platform;
    response.content["type"] = platform;
  }
  return response;
}

async function convertToManyChat(body, voiceflowKey) {
  const {
    message,
    intent,
    userId,
    showQuickReplies,
    showReplySuggestions,
    firstMessagePassthrough,
  } = body;
  const userLaunched = await checkIfUserHasStarted(userId, voiceflowKey);
  if (userLaunched) {
    const { data } = await axios(
      `https://general-runtime.voiceflow.com/state/user/${userId}/interact`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: voiceflowKey,
          Accept: "application/json",
        },
        data: {
          action: {
            type: intent ? "intent" : "text",
            payload: intent
              ? {
                  query: intent,
                }
              : message.replace(/\n/g, " ").trim(),
          },
        },
      },
    );
    return convertVoiceflowResponseToManyChat(
      data,
      showQuickReplies,
      showReplySuggestions,
      body.platform,
      body.contentId,
    );
  } else {
    const { data } = await axios(
      `https://general-runtime.voiceflow.com/state/user/${userId}/interact`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: voiceflowKey,
          Accept: "application/json",
        },
        data: {
          action: {
            type: "launch",
          },
        },
      },
    );
    if (firstMessagePassthrough) {
      const { data } = await axios(
        `https://general-runtime.voiceflow.com/state/user/${userId}/interact`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: voiceflowKey,
            Accept: "application/json",
          },
          data: {
            action: {
              type: intent ? "intent" : "text",
              payload: intent
                ? {
                    query: intent,
                  }
                : message.replace(/\n/g, " ").trim(),
            },
          },
        },
      );
      return convertVoiceflowResponseToManyChat(
        data,
        showQuickReplies,
        showReplySuggestions,
        body.platform,
        body.contentId,
      );
    } else {
      return convertVoiceflowResponseToManyChat(
        data,
        showQuickReplies,
        showReplySuggestions,
        body.platform,
        body.contentId,
      );
    }
  }
}

const schema = {
  type: "object",
  properties: {
    message: { type: "string" },
    userId: { type: ["string", "number"] },
    intent: { type: ["string", "null"] },
    platform: { type: ["string", "null"] },
    showQuickReplies: { type: "boolean" },
    showReplySuggestions: { type: "boolean" },
    firstMessagePassthrough: { type: "boolean" },
    contentId: { type: "string" },
  },
  required: [
    "message",
    "intent",
    "userId",
    "showQuickReplies",
    "showReplySuggestions",
    "firstMessagePassthrough",
    "contentId",
  ],
};
const headersSchema = {
  type: "object",
  properties: {
    authorization: { type: "string" },
  },
  required: ["authorization"],
};
const validate = ajv.compile(schema);
const validateHeaders = ajv.compile(headersSchema);

app.post("/", async (req, res) => {
  if (req.method != "POST") {
    res.status(401).send("Invalid method");
    return;
  }
  if (!validateHeaders(req.headers)) {
    res.status(403).send("Unauthorized");
    return;
  }
  try {
    console.log("Request: ", req.body);
    if (validate(req.body)) {
      if (typeof req.body.userId == "number") {
        req.body.userId = `${req.body.userId}`;
      }
      const result = await convertToManyChat(
        req.body,
        req.headers.authorization,
      );
      console.log(result);
      res.status(200).json(result);
    } else {
      res.status(400).send("Invalid body: " + JSON.stringify(validate.errors));
    }
  } catch (error) {
    console.error(error);
    res.status(500).send("ERROR");
  }
});

app.listen(3000, () => {
  console.log("Express server initialized");
});
