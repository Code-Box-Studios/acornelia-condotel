import Link from 'next/link'
const links=[{href:'/staff',label:'Today'},{href:'/staff/calendar',label:'Calendar'},{href:'/staff/bookings',label:'Bookings'},{href:'/staff/payments',label:'Payments'},{href:'/staff/enquiries',label:'Enquiries'},{href:'/staff/reports',label:'Reports'},{href:'/staff/direct',label:'Phone & walk-in'},{href:'/admin',label:'Content & rooms'}]
/** Shared staff workspace frame. Navigation never grants access; every page and action re-checks the policy. */
export function StaffShell({title,description,current,children}:{title:string;description:string;current:string;children:React.ReactNode}){
 return <main id="main" className="shell section staff-screen"><p className="eyebrow">Acornelia staff</p>
  <nav aria-label="Staff workspace" className="staff-nav">{links.map(link=><Link key={link.href} href={link.href} aria-current={current===link.href?'page':undefined}>{link.label}</Link>)}</nav>
  <h1>{title}</h1><p className="account-intro">{description}</p>{children}</main>
}
export function StaffUnavailable({denied}:{denied:boolean}){
 return <section className="status-panel">{denied?<><h2>This workspace is not available for your role.</h2><p>The property operator must approve this staff capability before you can use it.</p></>:<><h2>The workspace could not load.</h2><p>Reload the page. If it keeps failing, contact the developer.</p></>}</section>
}
