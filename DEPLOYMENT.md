# Deployment Setup

This document outlines the automatic deployment setup for the Retirement Simulator to Vercel.

## GitHub Secrets Configuration

Before the deployment workflow can run, you need to add the following secrets to your GitHub repository:

### Required Secrets

1. **VERCEL_TOKEN**
   - Go to [Vercel Settings > Tokens](https://vercel.com/account/tokens)
   - Click "Create Token"
   - Give it a name like "GitHub Actions"
   - Copy the token value
   - Add it as a GitHub secret

2. **VERCEL_ORG_ID**
   - Value: `team_kWDvUbbwNQFjpb0q6yh6SIlO`
   - This is your Vercel team/organization ID

3. **VERCEL_PROJECT_ID**
   - This will be provided after creating the Vercel project
   - Get it from the Vercel project settings or via API

### How to Add GitHub Secrets

1. Go to your GitHub repository
2. Navigate to Settings > Secrets and variables > Actions
3. Click "New repository secret"
4. Add each secret with the exact name and value

## Vercel Project Setup

To complete the setup, you need to:

1. **Create a Vercel project** linked to this GitHub repository
2. **Configure build settings** (already configured in `vercel.json`)
3. **Get the Project ID** and add it to GitHub secrets

## Deployment Flow

- **Production Deployments**: Triggered on push to `main` branch
- **Preview Deployments**: Triggered on pull requests to `main` branch
- **Automatic Comments**: PR deployments get a comment with the preview URL

## Monitoring Deployments

You can monitor deployments via:

- GitHub Actions tab in the repository
- Vercel dashboard
- MCP commands for programmatic access

## Next Steps

1. Add the required GitHub secrets
2. Create the Vercel project
3. Test the deployment with a feature branch
4. Verify production deployment works

## Troubleshooting

- Check GitHub Actions logs for build errors
- Verify all secrets are correctly set
- Ensure Vercel project is properly linked to GitHub repo
- Check `vercel.json` configuration for any issues

## Test Status

- ✅ GitHub secrets configured
- 🧪 Testing deployment workflow...
