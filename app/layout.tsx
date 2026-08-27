import type {Metadata} from 'next';import './globals.css';
export const metadata:Metadata={
 title:'有序 · 个人节奏规划',
 description:'把项目、今日清单、课表、习惯和想法放在一个安静的地方。',
 manifest:'/manifest.webmanifest',
 icons:{icon:'/icon-192.png',apple:'/icon-192.png'}
};
export const viewport={themeColor:'#6f7c62'};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="zh-CN"><body>{children}</body></html>}
