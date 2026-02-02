import { Link } from "wouter";
import { Wallet, Facebook, Twitter, Linkedin } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-neutral-900 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center mb-4">
              <Wallet className="text-white mr-2" />
              <h3 className="text-white font-bold text-lg font-sans">CODA</h3>
            </div>
            <p className="text-gray-300 text-sm">
              Helping you make smarter financial decisions with personalized
              insights and recommendations.
            </p>
          </div>

          <div>
            <h4 className="text-white font-medium mb-4">Features</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/plan" className="text-gray-300 hover:text-white">
                  Credit Score
                </Link>
              </li>
              <li>
                <Link href="/products?category=insurance" className="text-gray-300 hover:text-white">
                  Insurance Risk
                </Link>
              </li>
              <li>
                <Link href="/goals" className="text-gray-300 hover:text-white">
                  Financial Goals
                </Link>
              </li>
              <li>
                <Link href="/products" className="text-gray-300 hover:text-white">
                  Product Comparison
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-medium mb-4">Resources</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="#" className="text-gray-300 hover:text-white">
                  Financial Education
                </a>
              </li>
              <li>
                <a href="#" className="text-gray-300 hover:text-white">
                  Blog
                </a>
              </li>
              <li>
                <a href="#" className="text-gray-300 hover:text-white">
                  FAQ
                </a>
              </li>
              <li>
                <a href="#" className="text-gray-300 hover:text-white">
                  Support
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-medium mb-4">Legal</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="#" className="text-gray-300 hover:text-white">
                  Privacy Policy
                </a>
              </li>
              <li>
                <a href="#" className="text-gray-300 hover:text-white">
                  Terms of Service
                </a>
              </li>
              <li>
                <a href="#" className="text-gray-300 hover:text-white">
                  Data Security
                </a>
              </li>
              <li>
                <a href="#" className="text-gray-300 hover:text-white">
                  Cookies
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-gray-700 flex flex-col md:flex-row justify-between items-center">
          <div className="text-gray-300 text-sm mb-4 md:mb-0">
            &copy; {new Date().getFullYear()} CODA. All rights reserved.
          </div>

          <div className="flex space-x-4">
            <a href="#" className="text-gray-300 hover:text-white">
              <Facebook size={20} />
            </a>
            <a href="#" className="text-gray-300 hover:text-white">
              <Twitter size={20} />
            </a>
            <a href="#" className="text-gray-300 hover:text-white">
              <Linkedin size={20} />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
