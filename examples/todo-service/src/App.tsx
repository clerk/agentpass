import { useState, useEffect, useCallback } from 'react';
import { ClerkProvider, Show, SignInButton, UserButton, useUser, useAuth } from "@clerk/react";

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8788';

interface Todo {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
  createdBy?: string;
}

function TodoApp() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchTodos = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/todos`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json() as { todos: Todo[] };
        setTodos(data.todos);
      }
    } catch (e) {
      console.error('Failed to fetch todos:', e);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);

  const addTodo = async () => {
    if (!newTitle.trim()) return;
    const token = await getToken();
    const res = await fetch(`${API_URL}/api/todos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: newTitle }),
    });
    if (res.ok) {
      setNewTitle('');
      fetchTodos();
    }
  };

  const toggleTodo = async (id: string, completed: boolean) => {
    const token = await getToken();
    await fetch(`${API_URL}/api/todos/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ completed: !completed }),
    });
    fetchTodos();
  };

  const deleteTodo = async (id: string) => {
    const token = await getToken();
    await fetch(`${API_URL}/api/todos/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchTodos();
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ margin: 0 }}>Todo App</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>{user?.primaryEmailAddress?.emailAddress}</span>
          <UserButton />
        </div>
      </header>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addTodo()}
          placeholder="Add a new todo..."
          style={{
            flex: 1, padding: '0.75rem', borderRadius: '8px',
            border: '1px solid #d1d5db', fontSize: '1rem',
          }}
        />
        <button
          onClick={addTodo}
          style={{
            padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none',
            background: '#2563eb', color: 'white', cursor: 'pointer', fontWeight: 600,
          }}
        >
          Add
        </button>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : todos.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem' }}>No todos yet. Add one above!</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {todos.map((todo) => (
            <li key={todo.id} style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '0.75rem', borderBottom: '1px solid #e5e7eb',
            }}>
              <input
                type="checkbox"
                checked={todo.completed}
                onChange={() => toggleTodo(todo.id, todo.completed)}
                style={{ width: '20px', height: '20px', cursor: 'pointer' }}
              />
              <span style={{
                flex: 1,
                textDecoration: todo.completed ? 'line-through' : 'none',
                color: todo.completed ? '#9ca3af' : '#111827',
              }}>
                {todo.title}
              </span>
              {todo.createdBy && (
                <span style={{ fontSize: '0.75rem', color: '#9ca3af', background: '#f3f4f6', padding: '0.125rem 0.5rem', borderRadius: '4px' }}>
                  by {todo.createdBy}
                </span>
              )}
              <button
                onClick={() => deleteTodo(todo.id)}
                style={{
                  background: 'none', border: 'none', color: '#ef4444',
                  cursor: 'pointer', fontSize: '1.25rem', padding: '0 0.25rem',
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      <Show when="signed-in">
        <TodoApp />
      </Show>
      <Show when="signed-out">
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '100vh', fontFamily: 'system-ui, sans-serif',
        }}>
          <h1>Todo App</h1>
          <p style={{ marginBottom: '1rem' }}>Sign in to manage your todos.</p>
          <SignInButton mode="modal">
            <button style={{
              padding: '0.75rem 2rem', fontSize: '1rem', borderRadius: '8px',
              border: 'none', background: '#2563eb', color: 'white', cursor: 'pointer',
            }}>
              Sign In
            </button>
          </SignInButton>
        </div>
      </Show>
    </ClerkProvider>
  );
}
