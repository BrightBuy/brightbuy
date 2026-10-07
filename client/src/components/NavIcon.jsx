import React from 'react';
const paths = {
 home: 'm3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7',
 about: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM12 11v6M12 7v.01',
 contact: 'M3 5h18v14H3V5Zm0 1 9 7 9-7',
 join: 'M14 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM3 21v-2a7 7 0 0 1 11-5M19 14v8M15 18h8',
 shop: 'M3 9h18M5 9v12h14V9M3 9l2-6h14l2 6M9 21v-7h6v7',
 bag: 'M5 7h14l1 14H4L5 7Zm3 0V5a4 4 0 0 1 8 0v2',
 user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2',
 orders: 'M4 5h16v16H4V5Zm4 4h8M8 13h8M8 17h4M8 2v5M16 2v5',
 pin: 'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
 admin: 'M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z',
 logout: 'M10 3H4v18h6M9 12h12m-5-5 5 5-5 5',
 menu: 'M3 6h18M3 12h18M3 18h18',
 close: 'm5 5 14 14M19 5 5 19',
};
export function NavIcon({ name }) { return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.user}/></svg>; }
