import { Extension } from "@tiptap/core";

export const UnderlineColor = Extension.create({
  name: "underlineColor",

  addOptions() {
    return {
      types: ["textStyle"],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          underlineColor: {
            default: null,
            parseHTML: (element) => element.style.textDecorationColor?.replace(/["']+/g, "") || null,
            renderHTML: (attributes) => {
              if (!attributes.underlineColor) {
                return {};
              }

              return {
                style: `text-decoration-color: ${attributes.underlineColor}`,
              };
            },
          },
        },
      },
    ];
  },
});
