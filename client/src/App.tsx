import { Outlet } from "react-router";
import { Toaster } from '@/components/ui/sonner'

function App() {
    return (
        <div className="app">
            <Outlet />
            <Toaster richColors position="top-right" visibleToasts={3} expand={true}></Toaster>
        </div>
    )
}

export default App