# LLM Analysis Quiz

This project is a web service that uses a large language model to automatically solve quizzes found on web pages.

## Quick Start

1.  **Install dependencies:**
    ```bash
    npm install
    ```

2.  **Set up environment variables:**
    Copy the `.env.example` file to `.env` and fill in the required values.
    ```bash
    cp .env.example .env
    ```

3.  **Build the project:**
    ```bash
    npm run build
    ```

4.  **Run the server:**
    ```bash
    npm start
    ```

## Environment Variables

*   `SECRET_KEY`: A secret key for signing JWTs.
*   `LLM_API_KEY`: Your API key for the language model.
*   `LOG_LEVEL`: (Optional) Logging level - `debug`, `info`, `warn`, `error`. Defaults to `debug` in development, `info` in production.
*   `BROWSER_PATH`: (Optional) The path to a local Chromium executable.

## Available Scripts

*   `dev`: Start the development server with live reloading.
*   `build`: Compile the TypeScript code to JavaScript.
*   `start`: Start the production server.
*   `start:bun`: Start the server using Bun.
*   `test:unit`: Run unit tests.
*   `test`: Run the main test file.
*   `lint`: Lint the codebase.
*   `typecheck`: Type-check the project.

## Deployment

This project is configured for deployment on [Railway](https://railway.app/).
