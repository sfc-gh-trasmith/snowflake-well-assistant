/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        midnight: '#000000',
        'mid-blue': '#29B5E8',
        'medium-gray': '#5B5B5B',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
