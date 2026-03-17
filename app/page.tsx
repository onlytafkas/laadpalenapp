import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SignInButton } from "@clerk/nextjs";
import { 
  Zap, 
  BarChart3, 
  MapPin, 
  Clock, 
  Shield, 
  Smartphone 
} from "lucide-react";

export default async function Home() {
  const { userId } = await auth();
  
  // Redirect authenticated users to dashboard
  if (userId) {
    redirect("/dashboard");
  }

  const features = [
    {
      icon: Zap,
      title: "Real-Time Monitoring",
      description: "Track charging station status, power output, and availability in real-time."
    },
    {
      icon: MapPin,
      title: "Location Management",
      description: "Manage multiple charging locations from a single, intuitive dashboard."
    },
    {
      icon: BarChart3,
      title: "Analytics & Insights",
      description: "Gain valuable insights with detailed usage analytics and reporting tools."
    },
    {
      icon: Clock,
      title: "Session History",
      description: "Access complete charging session history with detailed logs and metrics."
    },
    {
      icon: Shield,
      title: "Secure & Reliable",
      description: "Enterprise-grade security with reliable uptime and data protection."
    },
    {
      icon: Smartphone,
      title: "Mobile Friendly",
      description: "Manage your charging stations on-the-go with our responsive design."
    }
  ];

  return (
    <div className="min-h-screen bg-linear-to-b from-zinc-950 via-zinc-900 to-black">
      {/* Hero Section */}
      <section className="relative overflow-hidden px-6 py-24 sm:py-32 lg:px-8">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute left-[50%] top-0 h-200 w-200 -translate-x-[30%] rounded-full bg-linear-to-tr from-emerald-500/20 to-blue-500/20 blur-3xl" />
        </div>
        
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-400">
            <Zap className="h-4 w-4" />
            <span>Charging Station Management Platform</span>
          </div>
          
          <h1 className="mb-6 text-5xl font-bold tracking-tight text-white sm:text-7xl">
            Manage Your Charging Network with{" "}
            <span className="bg-linear-to-r from-emerald-400 to-blue-500 bg-clip-text text-transparent">
              Confidence
            </span>
          </h1>
          
          <p className="mx-auto mb-10 max-w-2xl text-lg leading-8 text-zinc-300 sm:text-xl">
            Comprehensive charging station management platform for monitoring, analytics, 
            and control. Optimize your EV charging infrastructure with real-time insights.
          </p>
          
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <SignInButton mode="modal">
              <Button size="lg" className="h-12 gap-2 rounded-full bg-emerald-600 px-8 text-base font-semibold hover:bg-emerald-500">
                Get Started
                <Zap className="h-5 w-5" />
              </Button>
            </SignInButton>
            <Button 
              size="lg" 
              variant="outline" 
              className="h-12 rounded-full border-zinc-700 bg-transparent px-8 text-base font-semibold text-white hover:bg-zinc-800 hover:text-white"
              asChild
            >
              <a href="#features">Learn More</a>
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="px-6 py-24 sm:py-32 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto mb-16 max-w-2xl text-center">
            <h2 className="mb-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Everything You Need to Manage Your Charging Stations
            </h2>
            <p className="text-lg text-zinc-400">
              Powerful features designed to simplify charging station management and maximize efficiency.
            </p>
          </div>
          
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="group relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8 backdrop-blur transition-all hover:border-zinc-700 hover:bg-zinc-900"
                >
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 transition-colors group-hover:bg-emerald-500/20">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mb-2 text-xl font-semibold text-white">
                    {feature.title}
                  </h3>
                  <p className="text-zinc-400">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-6 py-24 sm:py-32 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="mb-6 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Ready to Transform Your Charging Network?
          </h2>
          <p className="mx-auto mb-10 max-w-xl text-lg text-zinc-400">
            Join the platform trusted by charging station operators worldwide. 
            Get started in minutes.
          </p>
          <SignInButton mode="modal">
            <Button size="lg" className="h-12 gap-2 rounded-full bg-emerald-600 px-8 text-base font-semibold hover:bg-emerald-500">
              Start Managing Today
              <Zap className="h-5 w-5" />
            </Button>
          </SignInButton>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800 px-6 py-12">
        <div className="mx-auto max-w-7xl text-center text-sm text-zinc-500">
          <p>© {new Date().getFullYear()} Charging Stations App. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
