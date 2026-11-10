// Bundles the panel into custom_components/hometrack/frontend/hometrack-panel.js.
// `npm run dev` instead serves dev/index.html (a mock Home Assistant) on :8000.
import * as esbuild from "esbuild";

const dev = process.argv.includes("--dev");
const options = {
  entryPoints: ["src/panel.js"],
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: !dev,
  sourcemap: dev ? "inline" : false,
  legalComments: "eof",
  outfile: dev ? "dev/hometrack-panel.js" : "../custom_components/hometrack/frontend/hometrack-panel.js",
};

if (dev) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: "dev", port: 8000 });
  console.log(`Dev harness on http://localhost:${port}/`);
} else {
  await esbuild.build(options);
}
