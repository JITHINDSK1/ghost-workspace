This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Download & Install (Desktop App)

You can download the compiled Windows executable version of Ghost directly from the GitHub Releases page so you don't need to deal with code or running a server manually.

1. Go to the [Releases page](../../releases) of this repository.
2. Download the `Ghost Setup X.X.X.exe` installer from the latest release.
3. Run the installer to install Ghost on your machine.

**Note on Windows SmartScreen**: Because this app is unsigned (a code signing certificate costs money), Windows may show a blue "Windows protected your PC" / "Unknown Publisher" warning when you first launch the installer. This is completely normal for open-source apps. To proceed, click **"More info"** and then **"Run anyway"**.

### API Keys Security
Since Ghost is a locally installed app, your API keys (like OpenRouter) are never bundled with the app code. You will need to enter your API keys safely inside the application's Settings menu. The keys are stored securely inside your local machine's browser/app storage and are only sent directly to the AI providers.
