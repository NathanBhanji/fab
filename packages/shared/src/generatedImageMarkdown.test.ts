import { expect, it } from "vite-plus/test";

import { appendGeneratedImageEmbeds } from "./generatedImageMarkdown.ts";

it.each([
  {
    name: "appends each new image once",
    text: "Done.",
    saved: ["/tmp/a.png", "/tmp/b.png", "/tmp/a.png"],
    expected: "Done.\n\n![](</tmp/a.png>)\n\n![](</tmp/b.png>)",
  },
  {
    name: "skips images the reply already shows",
    text: String.raw`![A](</tmp/a b.png>) ![B][a\*b] ![C](file:///tmp/c.png)

[a\*b]: /tmp/b.png`,
    saved: ["/tmp/a b.png", "/tmp/b.png", "/tmp/c.png", "/tmp/D.png"],
    expected: String.raw`![A](</tmp/a b.png>) ![B][a\*b] ![C](file:///tmp/c.png)

[a\*b]: /tmp/b.png

![](</tmp/D.png>)`,
  },
  {
    name: "links, code and escaped embeds still need a preview",
    text: "[open](/tmp/a.png) `![](/tmp/a.png)`\n\n```md\n![](/tmp/a.png)\n```\n\\![](/tmp/a.png)",
    saved: ["/tmp/a.png"],
    expected:
      "[open](/tmp/a.png) `![](/tmp/a.png)`\n\n```md\n![](/tmp/a.png)\n```\n\\![](/tmp/a.png)\n\n![](</tmp/a.png>)",
  },
  {
    name: "an unclosed trailing fence is closed first",
    text: 'Created.\n\n~~~js\nconsole.log("done");',
    saved: ["/tmp/a.png"],
    expected: 'Created.\n\n~~~js\nconsole.log("done");\n~~~\n\n![](</tmp/a.png>)',
  },
  {
    name: "an unclosed trailing HTML comment is closed first",
    text: "<!--\n![](</tmp/a.png>)",
    saved: ["/tmp/a.png"],
    expected: "<!--\n![](</tmp/a.png>)\n-->\n\n![](</tmp/a.png>)",
  },
  {
    name: "an unclosed trailing raw HTML block is closed first",
    text: "<pre>\nlog",
    saved: ["/tmp/a.png"],
    expected: "<pre>\nlog\n</pre>\n\n![](</tmp/a.png>)",
  },
  {
    name: "reserved characters keep their path",
    text: "",
    saved: ["/tmp/a#b?100%25&copy;\\!\n<x>.png"],
    expected: "![](</tmp/a%23b%3F100%2525%26copy;%5C!%0A\\<x\\>.png>)",
  },
])("generated image embeds: $name", ({ text, saved, expected }) => {
  const result = appendGeneratedImageEmbeds(text, saved);
  expect(result).toBe(expected);
  // Clients read every appended embed back as its saved file.
  expect(appendGeneratedImageEmbeds(result, saved)).toBe(result);
});
