// The three starter chips, passed as the chat component's static `suggestions` array. Not
// useCopilotChatSuggestions: in CopilotKit 1.77 the dynamic hook loops on the client (chips mount,
// each runs agent/connect, the result reloads the suggestions and remounts the chips, and a new
// LLM run starts), burning about 9 agent/run calls per widget open until the limiter 429s. Each
// message equals its title, so a click sends the prompt the visitor sees.
const TITLES = [
  "What has Amin built?",
  "Is Amin available for hire?",
  "How do I book a call with Amin?",
];

export const CHAT_SUGGESTIONS = TITLES.map((title) => ({ title, message: title }));
