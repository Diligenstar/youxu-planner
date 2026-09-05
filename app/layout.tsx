import type {Metadata} from 'next';import './globals.css';
export const metadata:Metadata={
 title:'有序 · 个人节奏规划',
 description:'今天只看眼前一步，晚上收好记录。课表、项目和下一步都在这里。',
 manifest:'/manifest.webmanifest',
 icons:{icon:'/icon-192.png',apple:'/icon-192.png'}
};
export const viewport={themeColor:'#6f7c62'};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="zh-CN"><body>{children}</body></html>}
