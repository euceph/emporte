import React from 'react'
import {Link} from 'react-router'

const NotFound: React.FC = () => {
    return (
        <div
            className="flex flex-col items-center justify-center min-h-screen bg-[var(--color-background)] text-[var(--color-text)]">
            <div className="max-w-md w-full p-6 text-center">
                <h1 className="text-4xl font-bold mb-4">404</h1>
                <p className="text-xl mb-6">Page not found</p>
                <p className="mb-8">The page you're looking for doesn't exist or has been moved.</p>
                <Link to="/" className="text-[var(--color-primary)] hover:underline">
                    Return to home
                </Link>
            </div>
        </div>
    )
}

export default NotFound