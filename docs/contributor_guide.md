# Comprehensive Guide for New Contributors

Welcome to our MkDocs project! This guide will help you set up your environment, make contributions, and deploy changes. Whether you're new to GitHub or MkDocs, follow these step-by-step instructions to get started.

## Prerequisites

Before you begin, ensure you have the following tools installed:

1. **Visual Studio Code (VSCode)**: A powerful and free code editor.
   - Download and install VSCode from [here](https://code.visualstudio.com/).

2. **Git**: A version control system to manage code changes.
   - Download and install Git from [here](https://git-scm.com/downloads).

3. **Python**: A programming language required to run MkDocs.
   - Download and install Python from [here](https://www.python.org/downloads/).

## Setting Up the Project

1. **Fork the Repository**

   - Go to the project repository on GitHub and click on the "Fork" button in the upper right corner to create a copy of the repository under your GitHub account.

2. **Clone Your Fork**

   - Open VSCode.
   - Open the terminal in VSCode by selecting `View > Terminal` or using the shortcut `` Ctrl+` ``.
   - In the terminal, clone your forked repository by running:

     ```bash
     git clone https://github.com/your-username/your-repository.git
     cd your-repository
     ```

3. **Create a Virtual Environment**

   - Set up a virtual environment to manage your dependencies. In the terminal, run:

     ```bash
     python -m venv env
     ```

   - Activate the virtual environment:
     - On Windows:

       ```bash
       env\Scripts\activate
       ```

     - On macOS and Linux:

       ```bash
       source env/bin/activate
       ```

4. **Install Dependencies**

   - Install MkDocs and the Material theme by running:

     ```bash
     pip install mkdocs mkdocs-material
     ```

5. **Run the Project Locally**

   - Start the MkDocs development server to see your changes live:

     ```bash
     mkdocs serve
     ```

   - Open your browser and go to `http://127.0.0.1:8000/` to view the site.

## Making Contributions

### Creating a New Page

1. **Create a Markdown File**

   - In VSCode, create a new file in the `docs` directory. For example:

     ```bash
     docs/new_page.md
     ```

2. **Add Content to the Page**

   - Open the new file in VSCode and add your content using Markdown syntax.

3. **Update the Navigation**

   - Open `mkdocs.yml` in VSCode and add your new page to the navigation:

     ```yaml
     nav:
       - Home: index.md
       - About: about.md
       - New Page: new_page.md
     ```

### Editing Existing Pages

1. **Locate the File**

   - In VSCode, navigate to the `docs` directory and find the Markdown file you want to edit.

2. **Make Your Changes**

   - Open the file in VSCode and make your changes.

### Committing and Pushing Changes

1. **Stage Your Changes**

   - In the terminal, stage your changes:

     ```bash
     git add .
     ```

2. **Commit Your Changes**

   - Commit your changes with a descriptive message:

     ```bash
     git commit -m "Describe your changes"
     ```

3. **Push to Your Fork**

   - Push your changes to your forked repository:

     ```bash
     git push origin main
     ```

4. **Create a Pull Request**

   - Go to the original repository on GitHub.
   - Click on the "Pull Requests" tab and then "New pull request".
   - Select your branch and create a pull request.

## Deploying Changes

Our project uses GitHub Actions to automatically deploy changes to GitHub Pages.

### GitHub Actions Workflow

1. **Ensure Your Workflow File is Correct**

   - The `.github/workflows/deploy.yml` file should look like this:

     ```yaml
     name: Deploy to GitHub Pages

     on:
       push:
         branches:
           - main
