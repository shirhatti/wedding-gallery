# Wedding Gallery Documentation

Welcome to the Wedding Gallery documentation. This serverless photo and video sharing platform is built entirely on Cloudflare's edge infrastructure.

## Documentation Structure

### Architecture

Detailed technical documentation on system design and implementation:

- **[Overview](architecture/overview.md)** - System architecture and design decisions
- **[Pages Migration](architecture/pages-migration.md)** - Migration to Cloudflare Pages with React
- **[HLS Implementation](architecture/hls-implementation.md)** - Adaptive video streaming implementation

### Operations

Runbooks and operational procedures:

- **[Token Revocation](operations/token-revocation.md)** - Invalidating authentication tokens
- **[Break Glass](operations/breakglass.md)** - Emergency branch protection bypass
- **[Upload Workflow](operations/upload-workflow.md)** - Photo and video upload procedures

### Development

Setup guides and development workflows:

- **[Workspace Setup](development/workspace-setup.md)** - Local development environment
- **[Frontend Setup](development/frontend-setup.md)** - React frontend development

## Quick Links

- [GitHub Repository](https://github.com/shirhatti/wedding-gallery)
- [DeepWiki Documentation](https://deepwiki.com/shirhatti/wedding-gallery)

## Additional Resources

Historical planning documents and technical analyses are available in the [archive](archive/) directory.

## Getting Help

For questions or issues:
- Review the relevant documentation section above
- Check the [DeepWiki](https://deepwiki.com/shirhatti/wedding-gallery) for comprehensive guides
- Review GitHub Actions logs for CI/CD issues
