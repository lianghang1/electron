export class ResourceType {
  static readonly NPE = new ResourceType('NPE', 'NPE', '业务码')
  static readonly GRID = new ResourceType('grid', 'grid', '格位码')
  static readonly RESOURCE = new ResourceType('resource', 'R', '资源码')
  static readonly GOODS = new ResourceType('goods', 'G', '商品码')
  static readonly SERVICE = new ResourceType('service', 'S', '服务码')
  static readonly ASHES = new ResourceType('ashes', 'A', '')
  static readonly BOX = new ResourceType('box', 'B', '骨灰盒码')
  static readonly BODY = new ResourceType('body', 'Y', '遗体码')
  static readonly GU_HUI = new ResourceType('guHui', 'H', '火化证码')
  static readonly DEPOSIT = new ResourceType('deposit', 'D', '寄存码')
  static readonly DZHHZ = new ResourceType('dzhhz', 'dzhhz', '电子火化证码')
  static readonly DZJCZ = new ResourceType('dzjcz', 'dzjcz', '电子寄存证码')
  static readonly GC = new ResourceType('gc', 'C', '棺底码')
  static readonly GG = new ResourceType('gg', 'L', '棺盖码')
  static readonly PRODUCT = new ResourceType('PRODUCT', 'PRODUCT', '产品码')
  static readonly PAYMENT = new ResourceType('payment', 'payment', '结算码')
  static readonly PB = new ResourceType('PB', 'PB', '结算业务')

  private constructor(
    public readonly type: string,
    public readonly prefix: string,
    public readonly description: string,
  ) {}

  static values(): ResourceType[] {
    return Object.values(ResourceType).filter(value => value instanceof ResourceType)
  }

  static prefixDescriptions(): Record<string, string> {
    return ResourceType.values().reduce((acc, res) => {
      return { ...acc, [res.prefix]: res.description }
    }, {})
  }

  static formPrefix(prefix: string): ResourceType | undefined {
    return ResourceType.values().find(res => res.prefix === prefix)
  }
}

export const RESOURCE_PREFIXES = [ResourceType.RESOURCE.prefix, ResourceType.GRID.prefix]

export function isValidResourcePrefix(prefix: string) {
  return RESOURCE_PREFIXES.includes(prefix)
}
