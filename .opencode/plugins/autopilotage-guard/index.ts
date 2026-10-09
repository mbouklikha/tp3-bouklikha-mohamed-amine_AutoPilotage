import { Plugin } from "@opencode/plugin";

export default Plugin.define({
  id: "autopilotage-guard",
  async setup(ctx) {
    await ctx.session.hook("context", (event) => {
      event.system.push({
        type: "text",
        text: "AutoPilotage rules: strict TypeScript, validate inputs with Zod, parameterized SQLite queries via node:sqlite, isolated tests never touching data/autopilotage.db, no secrets, run check/lint/test/build after changes.",
      });
    });
  },
});
