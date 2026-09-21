'use client';

export async function generateStaticParams() { return [{ id: '1' }]; }
export const dynamicParams = true;

export default function WatchPage() { return <div style={{ padding: '20px', color: '#fff', backgroundColor: '#000', minHeight: '100vh' }}><h1>FlixCasa Player</h1></div>; }
