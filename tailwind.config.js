/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        felt: "#0b6a3a",
        feltDark: "#074a27",
        chip: "#d4af37",
      },
    },
  },
  plugins: [],
};
