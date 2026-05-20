Deployment instructions

1. Ensure your repo is pushed to GitHub (see commands below).
2. On Render.com create a new Web Service and connect your GitHub repository.
   - Select "Docker" as the environment (Render will use the Dockerfile).
   - Branch: main
   - Start command: node server.js
3. Deploy. Render's free plan will build the Docker image and run your service.

Quick commands (run locally):

  git init
  git checkout -B main
  git add .
  git commit -m "Add Dockerfile and Render manifest"

Create GitHub repo (Option A: using GitHub CLI if installed):

  gh repo create USERNAME/wpdf --public --source=. --remote=origin --push

Option B: manual remote

  # create repo on github.com, then run:
  git remote add origin https://github.com/USERNAME/wpdf.git
  git push -u origin main

After the repo is on GitHub, go to https://render.com, create a new Web Service, connect the repository, and deploy.
