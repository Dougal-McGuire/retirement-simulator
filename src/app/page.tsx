import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp, Shield, Calculator, BarChart3, PlayCircle, Users, CheckCircle } from "lucide-react"
import { AnimatedCounter } from "@/components/ui/animated-counter"
import { MobileMenu } from "@/components/navigation/MobileMenu"

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header id="navigation" className="border-b bg-white/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-2">
              <Calculator className="h-8 w-8 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900">Retirement Simulator</h1>
            </div>
            <div className="flex items-center space-x-4">
              <nav className="hidden md:flex space-x-8">
                <Link href="#features" className="text-gray-600 hover:text-gray-900 transition-colors">Features</Link>
                <Link href="#statistics" className="text-gray-600 hover:text-gray-900 transition-colors">Statistics</Link>
                <Link href="#about" className="text-gray-600 hover:text-gray-900 transition-colors">About</Link>
              </nav>
              <MobileMenu />
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main id="main-content">
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6 animate-fade-in">
              Plan Your Early Retirement with{" "}
              <span className="text-blue-600">Confidence</span>
            </h2>
            <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto animate-fade-in-delayed">
              Advanced Monte Carlo simulation to help you understand your retirement scenarios. 
              Model market volatility, inflation, and various expense categories to make informed decisions.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in-more-delayed">
              <Button asChild size="lg" className="text-lg px-8 py-6 transition-all hover:scale-105 hover:shadow-lg">
                <Link href="/setup">Start Planning</Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="text-lg px-8 py-6 transition-all hover:scale-105 hover:shadow-lg group">
                <Link href="/simulation" className="flex items-center space-x-2">
                  <PlayCircle className="h-5 w-5 group-hover:text-blue-600 transition-colors" />
                  <span>Interactive Demo</span>
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Statistics Section */}
        <section id="statistics" className="py-16 px-4 sm:px-6 lg:px-8 bg-white/60 backdrop-blur-sm">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h3 className="text-3xl font-bold text-gray-900 mb-4">
                Trusted by Financial Planners Worldwide
              </h3>
              <p className="text-gray-600 max-w-2xl mx-auto">
                Our simulation engine has processed thousands of retirement scenarios with proven accuracy.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
              <div className="text-center">
                <div className="text-4xl font-bold text-blue-600 mb-2">
                  <AnimatedCounter end={15000} suffix="+" />
                </div>
                <div className="text-gray-600 font-medium">Simulations Run</div>
                <div className="text-sm text-gray-500 mt-1">This month</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-green-600 mb-2">
                  <AnimatedCounter end={98.7} decimals={1} suffix="%" delay={200} />
                </div>
                <div className="text-gray-600 font-medium">Accuracy Rate</div>
                <div className="text-sm text-gray-500 mt-1">Validated predictions</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-purple-600 mb-2">
                  <AnimatedCounter end={2500} suffix="+" delay={400} />
                </div>
                <div className="text-gray-600 font-medium">Active Users</div>
                <div className="text-sm text-gray-500 mt-1">Planning their future</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-orange-600 mb-2">
                  <AnimatedCounter end={4.9} decimals={1} delay={600} />
                </div>
                <div className="text-gray-600 font-medium">User Rating</div>
                <div className="text-sm text-gray-500 mt-1">Out of 5 stars</div>
              </div>
            </div>
          </div>
        </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h3 className="text-3xl font-bold text-gray-900 mb-4">
              Sophisticated Financial Modeling
            </h3>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Our simulation engine uses proven mathematical models to provide realistic 
              projections for your retirement planning.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card className="transition-all duration-300 hover:shadow-lg hover:-translate-y-1 group">
              <CardHeader>
                <TrendingUp className="h-12 w-12 text-blue-600 mb-4 group-hover:scale-110 transition-transform duration-300" />
                <CardTitle>Monte Carlo Simulation</CardTitle>
                <CardDescription>
                  Run thousands of scenarios with stochastic market returns and inflation
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-gray-600 space-y-2">
                  <li className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>Box-Muller normal distribution</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>Configurable volatility parameters</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>Success rate calculations</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>Percentile analysis (10th, 50th, 90th)</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="transition-all duration-300 hover:shadow-lg hover:-translate-y-1 group">
              <CardHeader>
                <Shield className="h-12 w-12 text-green-600 mb-4 group-hover:scale-110 transition-transform duration-300" />
                <CardTitle>Comprehensive Planning</CardTitle>
                <CardDescription>
                  Model all aspects of your financial life in retirement
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-gray-600 space-y-2">
                  <li className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>Asset accumulation phase</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>Retirement distribution phase</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>Pension income integration</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>Capital gains tax modeling</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="transition-all duration-300 hover:shadow-lg hover:-translate-y-1 group">
              <CardHeader>
                <BarChart3 className="h-12 w-12 text-purple-600 mb-4 group-hover:scale-110 transition-transform duration-300" />
                <CardTitle>Interactive Visualization</CardTitle>
                <CardDescription>
                  Real-time charts and analytics to understand your scenarios
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-gray-600 space-y-2">
                  <li className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>Asset projection charts</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>Spending timeline analysis</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>Parameter sensitivity testing</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>Export and save scenarios</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-blue-600">
        <div className="max-w-4xl mx-auto text-center">
          <h3 className="text-3xl font-bold text-white mb-4">
            Ready to Take Control of Your Financial Future?
          </h3>
          <p className="text-blue-100 text-lg mb-8">
            Start with our guided setup wizard or jump directly into the simulation with default parameters.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild size="lg" variant="secondary" className="text-lg px-8 py-6">
              <Link href="/setup">Start Setup Wizard</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="text-lg px-8 py-6 border-white text-white hover:bg-white hover:text-blue-600">
              <Link href="/simulation">Run Simulation</Link>
            </Button>
          </div>
        </div>
      </section>
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <Calculator className="h-6 w-6" />
                <span className="text-lg font-semibold">Retirement Simulator</span>
              </div>
              <p className="text-gray-400">
                Modern retirement planning with advanced Monte Carlo simulation.
              </p>
            </div>
            <div>
              <h4 className="text-lg font-semibold mb-4">Features</h4>
              <ul className="space-y-2 text-gray-400">
                <li>Monte Carlo Analysis</li>
                <li>Market Volatility Modeling</li>
                <li>Expense Categorization</li>
                <li>Real-time Visualization</li>
              </ul>
            </div>
            <div>
              <h4 className="text-lg font-semibold mb-4">Technology</h4>
              <ul className="space-y-2 text-gray-400">
                <li>Next.js 15 with TypeScript</li>
                <li>Recharts Visualization</li>
                <li>Tailwind CSS Design</li>
                <li>Zustand State Management</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; 2025 Retirement Simulator. Built with modern web technologies.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
