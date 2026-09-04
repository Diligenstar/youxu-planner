import type {Metadata} from 'next';import './globals.css';
export const metadata:Metadata={
 title:'有序 · 个人节奏规划',
 description:'用今日三件事、不断线打卡和十分钟断路，让日程少一点压力。',
 manifest:'/manifest.webmanifest',
 icons:{icon:'/icon-192.png',apple:'/icon-192.png'}
};
export const viewport={themeColor:'#6f7c62'};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="zh-CN"><body>{children}</body></html>}
