import { defineConfig } from "tinacms";

export default defineConfig({
  branch:
    process.env.TINA_PUBLIC_BRANCH ||
    process.env.HEAD ||
    process.env.VERCEL_GIT_COMMIT_REF ||
    "main",
  clientId: process.env.NEXT_PUBLIC_TINA_CLIENT_ID || null,
  token: process.env.TINA_TOKEN,

  build: {
    outputFolder: "admin",
    publicFolder: "public",
  },
  media: {
    tina: {
      mediaRoot: "images",
      publicFolder: "public",
    },
  },

  schema: {
    collections: [
      {
        name: "content",
        label: "Homepage Content",
        path: "content",
        format: "json",
        ui: {
          // Single-document collection - always edit content/home.json
          allowedActions: { create: false, delete: false },
        },
        fields: [
          {
            type: "object",
            name: "hero",
            label: "Hero",
            fields: [
              { type: "string", name: "heading", label: "Heading", ui: { component: "textarea" } },
              {
                type: "rich-text",
                name: "body",
                label: "Body",
                description: "Select a phrase and press Bold to apply the wavy-underline emphasis treatment.",
                overrides: { toolbar: ["bold"] },
              },
            ],
          },
          {
            type: "object",
            name: "mission",
            label: "Mission",
            fields: [
              { type: "string", name: "navLabel", label: "Nav label" },
              { type: "string", name: "heading", label: "Heading", ui: { component: "textarea" } },
              {
                type: "string",
                name: "body",
                label: "Body paragraphs",
                list: true,
                ui: { component: "textarea" },
              },
              { type: "image", name: "photoSrc", label: "Photo" },
              { type: "string", name: "photoAlt", label: "Photo alt text" },
              { type: "string", name: "photoCaption", label: "Photo caption", ui: { component: "textarea" } },
            ],
          },
          {
            type: "object",
            name: "work",
            label: "How We Work",
            fields: [
              { type: "string", name: "navLabel", label: "Nav label" },
              { type: "string", name: "heading", label: "Heading" },
              {
                type: "object",
                name: "mechanisms",
                label: "Mechanisms",
                list: true,
                ui: {
                  itemProps: (item) => ({ label: item?.title }),
                },
                fields: [
                  { type: "string", name: "title", label: "Title" },
                  { type: "string", name: "body", label: "Body", ui: { component: "textarea" } },
                ],
              },
            ],
          },
          {
            type: "object",
            name: "quote",
            label: "Brussels Effect Quote",
            fields: [
              { type: "string", name: "text", label: "Quote", ui: { component: "textarea" } },
              { type: "string", name: "body", label: "Body", ui: { component: "textarea" } },
            ],
          },
          {
            type: "object",
            name: "story",
            label: "Our Story",
            fields: [
              { type: "string", name: "navLabel", label: "Nav label" },
              { type: "string", name: "heading", label: "Heading" },
              {
                type: "object",
                name: "events",
                label: "Timeline events",
                list: true,
                ui: {
                  itemProps: (item) => ({ label: item?.heading }),
                },
                fields: [
                  { type: "string", name: "heading", label: "Heading" },
                  {
                    type: "rich-text",
                    name: "body",
                    label: "Body",
                    description: "Supports bold, italic, and links.",
                  },
                  { type: "string", name: "ctaLabel", label: "Button label (optional)" },
                  { type: "string", name: "ctaHref", label: "Button link (optional)" },
                  {
                    type: "object",
                    name: "images",
                    label: "Images (optional)",
                    list: true,
                    fields: [
                      { type: "image", name: "src", label: "Image" },
                      { type: "string", name: "alt", label: "Alt text" },
                      {
                        type: "string",
                        name: "position",
                        label: "Focal position",
                        options: ["center", "top", "bottom"],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            type: "object",
            name: "team",
            label: "Team",
            fields: [
              { type: "string", name: "navLabel", label: "Nav label" },
              { type: "string", name: "heading", label: "Heading" },
              {
                type: "object",
                name: "members",
                label: "Team members",
                list: true,
                ui: {
                  itemProps: (item) => ({ label: item?.name }),
                },
                fields: [
                  { type: "string", name: "name", label: "Name" },
                  { type: "string", name: "role", label: "Role" },
                  { type: "string", name: "bio", label: "Bio", ui: { component: "textarea" } },
                  { type: "string", name: "linkedin", label: "LinkedIn URL" },
                  { type: "image", name: "photo", label: "Photo" },
                ],
              },
            ],
          },
          {
            type: "object",
            name: "contact",
            label: "Contact",
            fields: [
              { type: "string", name: "navLabel", label: "Nav label" },
              { type: "string", name: "heading", label: "Heading", ui: { component: "textarea" } },
              { type: "string", name: "body", label: "Body", ui: { component: "textarea" } },
              { type: "string", name: "email", label: "Contact email" },
              { type: "string", name: "linkedin", label: "LinkedIn URL" },
            ],
          },
        ],
      },
    ],
  },
});
