/** 테스트용 롤꾸 샘플 3종 (사용자 제공, 2026-11-27). 앱에는 넣지 않는다 (2026-11-28: 기본 제공 롤꾸 없음) */
export interface Roll20CodeSample {
  id: string
  title: string
  code: string
}

export const ROLL20_CODE_SAMPLES: Roll20CodeSample[] = [
  {
    id: 'judge-button',
    title: '판정 버튼',
    code: '/desc [✷　?{기능|} 판정　✷](#" style=" text-decoration: none; font-style: normal !important; text-align: center; display: inline-block; color: white; letter-spacing: -1px; border-radius: 20px; padding: 5px 25px;margin-left: -4px;background-image: linear-gradient(135deg, #FF0053, #FFD444)',
  },
  {
    id: 'chapter',
    title: '챕터 표시',
    code: '/desc [─────── CHAPTER ?{챕터 숫자|} ───────](#" style="text-decoration:none; color: #F5C542; background-color:#EE1B60; text-align:center; display:block; padding:2px; box-shadow: 0px 8px 0px 15px #EE1B60; font-size:12px; font-style: normal;)[?{챕터명|}](#" style="text-decoration:none; color: #FFFFFF; background-color:#EE1B60; text-align:center; display:block; padding:2px; box-shadow: 0px 8px 0px 15px #EE1B60; font-style: normal;)',
  },
  {
    id: 'full-desc',
    title: '배경색이 꽉 차는 desc 서술',
    code: '/desc [?{내용|}](#" style="text-decoration:none; color: #FFFFFF; background-color:#87BD00; text-align:center; display:block; padding:2px; box-shadow: 0px 8px 0px 15px #87BD00;)',
  },
]
