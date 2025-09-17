# Jack Smith - Interactive Portfolio

A modern, AI-powered portfolio website built with Next.js, featuring real-time chat integration, stunning animations, and responsive design.

## ✨ Features

- **AI-Powered Chat Widget**: Interactive chat experience powered by Groq's lightning-fast LLaMA models
- **Smooth Animations**: Beautiful GSAP animations and transitions
- **Responsive Design**: Optimized for all devices with Tailwind CSS
- **Modern UI Components**: Built with Radix UI primitives
- **TypeScript**: Full type safety throughout the application
- **Performance Optimized**: Fast loading with Next.js 13+ features

## 🚀 Live Demo

[View Live Portfolio](https://your-domain.com) (Replace with your deployed URL)

## 🛠️ Tech Stack

- **Framework**: Next.js 13+ (App Router)
- **Styling**: Tailwind CSS
- **Animations**: GSAP (GreenSock)
- **UI Components**: Radix UI
- **Language**: TypeScript
- **AI Integration**: Groq LLaMA Models
- **Icons**: Lucide React

## 📋 Prerequisites

- Node.js 18+ 
- npm or yarn
- Groq API key (free tier available at groq.com)

## 🔧 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/jedsmith2004/Prompt-Based-Portfolio.git
   cd Prompt-Based-Portfolio
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   
   Create a `.env.local` file in the root directory:
   ```env
   GROQ_API_KEY=your_groq_api_key_here
   GROQ_MODEL=llama-3.1-70b-versatile
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   
   Navigate to [http://localhost:3000](http://localhost:3000)

## 📁 Project Structure

```
├── app/                    # Next.js 13+ app directory
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Home page
├── components/            # React components
│   ├── ui/               # Reusable UI components
│   ├── About.tsx         # About section
│   ├── ChatWidget.tsx    # AI chat component
│   ├── Hero.tsx          # Landing section
│   ├── Projects.tsx      # Projects showcase
│   └── ...
├── lib/                  # Utility libraries
│   ├── animations.ts     # GSAP animation manager
│   ├── ai-utils.ts       # AI/Chat utilities
│   └── utils.ts          # General utilities
├── pages/api/            # API routes
│   └── ask.ts            # Chat API endpoint
├── public/               # Static assets
│   ├── context.json      # Portfolio data
│   └── jack-avatar.jpg   # Profile image
└── hooks/                # Custom React hooks
```

## 🎨 Customization

### Personal Information
Update your information in `/public/context.json`:
```json
{
  "bio": {
    "name": "Your Name",
    "title": "Your Title",
    "email": "your.email@example.com",
    // ... other fields
  }
}
```

### Styling
- Modify colors and themes in `tailwind.config.ts`
- Update global styles in `app/globals.css`
- Component-specific styles are in each component file

### Chat Configuration
Customize the AI chat behavior in:
- `/pages/api/ask.ts` - API endpoint configuration
- `/lib/ai-utils.ts` - Chat utilities and prompts
- `/components/ChatWidget.tsx` - UI component

## 🚀 Deployment

### Vercel (Recommended)
1. Push your code to GitHub
2. Connect your repository to [Vercel](https://vercel.com)
3. Add your `GROQ_API_KEY` environment variable
4. Deploy!

### Other Platforms
The project can be deployed to any platform that supports Next.js:
- Netlify
- Railway
- Heroku
- DigitalOcean App Platform

## 🔒 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GROQ_API_KEY` | Groq API key for chat functionality | Yes |
| `GROQ_MODEL` | Model to use (default: llama-3.1-70b-versatile) | No |

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 Contact

Jack Smith - [jack@example.com](mailto:jack@example.com)

Project Link: [https://github.com/jedsmith2004/Prompt-Based-Portfolio](https://github.com/jedsmith2004/Prompt-Based-Portfolio)

## 🙏 Acknowledgments

- [Next.js](https://nextjs.org/) - React framework
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework
- [GSAP](https://greensock.com/gsap/) - Animation library
- [Radix UI](https://www.radix-ui.com/) - UI component library
- [OpenAI](https://openai.com/) - AI integration
