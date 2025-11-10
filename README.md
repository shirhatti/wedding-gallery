# Photo & Video Gallery Template

A serverless photo and video sharing platform built on Cloudflare's edge infrastructure. Perfect for weddings, events, or any occasion where you want to share and collect photos!

## ✨ Features

- 📸 **Responsive Photo Gallery** - Beautiful masonry layout with lazy loading
- 🎥 **Adaptive Video Streaming** - HLS video streaming with quality selection
- 🔒 **Optional Password Protection** - Secure your gallery with authentication
- 📱 **Mobile-Optimized** - Works perfectly on all devices
- ⚡ **Edge-Native Performance** - Fast loading from Cloudflare's global network
- 🎨 **Modern UI** - Clean interface built with React and Tailwind CSS
- 📤 **Guest Uploads** - Allow guests to upload their own photos (optional)
- 🖼️ **Automatic Thumbnails** - Multiple sizes for optimal performance
- 💰 **Cost-Effective** - Runs on Cloudflare's generous free tier

## 🏗️ Architecture

Built entirely on Cloudflare's platform:

- **Cloudflare Pages** - React-based gallery frontend
- **Cloudflare Workers** - API and video streaming backend
- **Cloudflare R2** - Media storage
- **Cloudflare D1** - Metadata database
- **Cloudflare KV** - Caching layer

## 🚀 Quick Start

### Prerequisites

- Cloudflare account (free tier works!)
- Node.js v20 or higher
- Basic familiarity with command line

### Setup

1. **Clone this repository**
   ```bash
   git clone <your-repo-url>
   cd wedding-gallery
   npm install
   ```

2. **Run the interactive setup**
   ```bash
   node scripts/setup-template.mjs
   ```

3. **Follow the detailed guide**

   See [SETUP.md](SETUP.md) for complete step-by-step instructions.

## 📚 Documentation

- **[Setup Guide](SETUP.md)** - Complete setup instructions
- **[Architecture](docs/architecture/overview.md)** - System design details
- **[Operations](docs/operations/)** - Management and maintenance
- **[Development](docs/development/)** - Local development guide

## 🎨 Customization

This template is highly customizable:

- **Branding** - Replace logos, colors, and text to match your event
- **Features** - Enable/disable password protection, uploads, videos
- **UI/UX** - Modify React components and Tailwind styles
- **Domain** - Use your own custom domain via Cloudflare Pages

See [Customization](SETUP.md#6-customization) in the setup guide.

## 💡 Use Cases

Perfect for:
- 🎉 Wedding photo galleries
- 🎂 Birthday party albums
- 🎓 Graduation photo collections
- 🏢 Corporate event galleries
- 👨‍👩‍👧‍👦 Family reunion photos
- 📷 Any event photo sharing!

## 📊 System Architecture

```
┌──────────────────┐
│ Cloudflare Pages │  (React Frontend)
└────────┬─────────┘
         │
    ┌────┴────┬─────────────────┐
    │         │                 │
┌───▼────┐ ┌──▼──────────┐ ┌───▼────┐
│ Viewer │ │ Video Stream│ │ Album  │  (Workers)
│ Worker │ │   Worker    │ │ Worker │
└───┬────┘ └──┬──────────┘ └───┬────┘
    │         │                 │
    └────┬────┴─────────────┬───┘
         │                  │
    ┌────▼────┐        ┌────▼────┐
    │ R2      │        │ D1 + KV │  (Storage)
    │ Storage │        │ Database│
    └─────────┘        └─────────┘
```

## 💰 Cost Estimates

Cloudflare's free tier is generous and should cover most use cases:
- **Pages**: Unlimited requests
- **Workers**: 100,000 requests/day
- **R2**: 10 GB storage
- **D1**: 5 GB storage
- **KV**: 1 GB storage

A typical gallery with 1,000 photos and moderate traffic stays within the free tier!

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## 📄 License

This template is open source. See [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

Built with:
- React + Vite
- Tailwind CSS + shadcn/ui
- Cloudflare Platform
- TypeScript

## 📞 Support

- 📖 Check the [documentation](docs/)
- 🐛 Report issues on [GitHub Issues](../../issues)
- 💬 See [SETUP.md](SETUP.md) for troubleshooting

---

**Ready to create your gallery?** Start with the [Setup Guide](SETUP.md)!
