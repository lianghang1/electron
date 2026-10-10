import type { ActivityRequest, ActivityResponse, BBsCremationScheduleRequest, BBsCremationScheduleResponse, BBsHallScheduleRequest, BBsHallScheduleResponse } from './types/funeral'

import { http } from '@/http'

export default {
  // 获取活动信息
  getCommonActivity: (params: ActivityRequest) => http.Get<ActivityResponse>(`/as/api/sdk/common/getActivity/${params}`),
  // 八宝山礼厅班次
  getBBsHallSchedule: (params: BBsHallScheduleRequest) => http.Get<BBsHallScheduleResponse>('/by/api/sdk/bbs/getHallScheduleList', params),
  // 八宝山火化班次
  getBBsCremationSchedule: (params: BBsCremationScheduleRequest) => http.Get<BBsCremationScheduleResponse>('/by/api/sdk/bbs/getCremationScheduleList', params),
}
