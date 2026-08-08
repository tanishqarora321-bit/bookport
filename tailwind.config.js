/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f172a",
        cutoff: "#dc2626",
        amend: "#d97706",
        navy: "#0c1a3a",       // sidebar background, matches the Claude Design mockup
        navyhover: "#16264f",
        accent: "#2f5fe0"       // "+ New Booking" blue
      }
    }
  },
  plugins: []
};
