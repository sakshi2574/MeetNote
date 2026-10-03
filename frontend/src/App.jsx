import { Route, Routes } from 'react-router-dom'

function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <main className="flex min-h-screen items-center justify-center bg-white text-slate-900">
            <h1 className="text-2xl font-semibold">MeetNote</h1>
          </main>
        }
      />
    </Routes>
  )
}

export default App
