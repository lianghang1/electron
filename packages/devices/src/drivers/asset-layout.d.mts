export interface AssetSource {
  /** 厂商名（assets 父目录名） */
  vendor: string
  /** assets 源目录绝对路径 */
  dir: string
  /** 产物相对 devices/ 的子路径：<域>/<厂商> 或 <域>（厂商与域同名） */
  targetRel: string
}

export interface DriverAssetPlan {
  /** 源文件绝对路径 */
  from: string
  /** 产物相对资源根的路径（统一 / 分隔，与域内声明一致） */
  to: string
}

export declare function collectAssetSources(devicesRoot: string): AssetSource[]

export declare function isRelevantAssetPlatform(platformDir: string, targetOs?: string): boolean

export declare function planDriverAssets(devicesRoot: string, targetOs?: string): DriverAssetPlan[]
