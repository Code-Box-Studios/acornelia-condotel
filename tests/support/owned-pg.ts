import pg from 'pg'
/** Track owned driver leases through public pool events so fixture shutdown can release them. */
export function ownedPostgresDriver(){
  const pools:OwnedPool[]=[]
  class OwnedPool extends pg.Pool {
    private checkedOut=new Set<pg.PoolClient>()
    constructor(options?:pg.PoolConfig){
      super(options)
      this.on('acquire',client=>this.checkedOut.add(client))
      this.on('release',(_error,client)=>this.checkedOut.delete(client))
      pools.push(this)
    }
    async finish(){
      // All test commands have settled before shutdown. The adapter retains a startup lease.
      for(const client of [...this.checkedOut])client.release()
      await this.end()
    }
  }
  return {driver:{...pg,Pool:OwnedPool},close:async()=>{for(const pool of pools)await pool.finish()}}
}
