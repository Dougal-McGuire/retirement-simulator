import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp, Shield, Calculator, BarChart3 } from "lucide-react"

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-2">
              <Calculator className="h-8 w-8 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900">Retirement Simulator</h1>
            </div>
            <nav className="hidden md:flex space-x-8">
              <Link href="#features" className="text-gray-600 hover:text-gray-900">Features</Link>
              <Link href="#about" className="text-gray-600 hover:text-gray-900">About</Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
            Plan Your Early Retirement with{" "}
            <span className="text-blue-600">Confidence</span>
          </h2>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Advanced Monte Carlo simulation to help you understand your retirement scenarios. 
            Model market volatility, inflation, and various expense categories to make informed decisions.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild size="lg" className="text-lg px-8 py-6">
              <Link href="/setup">Start Planning</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="text-lg px-8 py-6">
              <Link href="/simulation">Try Demo</Link>
            </Button>
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
            <Card>
              <CardHeader>
                <TrendingUp className="h-12 w-12 text-blue-600 mb-4" />
                <CardTitle>Monte Carlo Simulation</CardTitle>
                <CardDescription>
                  Run thousands of scenarios with stochastic market returns and inflation
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-gray-600 space-y-2">
                  <li>• Box-Muller normal distribution</li>
                  <li>• Configurable volatility parameters</li>
                  <li>• Success rate calculations</li>
                  <li>• Percentile analysis (10th, 50th, 90th)</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Shield className="h-12 w-12 text-green-600 mb-4" />
                <CardTitle>Comprehensive Planning</CardTitle>
                <CardDescription>
                  Model all aspects of your financial life in retirement
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-gray-600 space-y-2">
                  <li>• Asset accumulation phase</li>
                  <li>• Retirement distribution phase</li>
                  <li>• Pension income integration</li>
                  <li>• Tax considerations</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <BarChart3 className="h-12 w-12 text-purple-600 mb-4" />
                <CardTitle>Interactive Visualization</CardTitle>
                <CardDescription>
                  Real-time charts and analytics to understand your scenarios
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-gray-600 space-y-2">
                  <li>• Asset projection charts</li>
                  <li>• Spending timeline analysis</li>
                  <li>• Parameter sensitivity testing</li>
                  <li>• Export and save scenarios</li>
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
