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

/** 여러 줄 샘플 (사용자 제공, 2026-11-28) */
export const MULTI_MIXED = `/desc https://imgur.com/FCIyXNw.png
/desc [?{시나리오 제목}](#" style=" color: #F16A66 !important; text-decoration:none; font-style: normal;)
/desc [?{부제 or 캐치프라이즈}](#" style=" color: #FB9A85  !important; text-decoration:none; font-weight: normal; font-size: 11px;)[ ?{줄바꿈 필요시 넣고 없으면 바로 엔터}](#" style=" color: #FB9A85 !important; text-decoration:none; font-weight: normal; font-size: 11px; display:block;)
/desc [?{몇 명?}인 ?{몇 사이클?}사이클 ?{시나리오 타입}형](#" style=" color: #9FBEB4 !important; text-decoration:none; font-style: normal; font-weight: normal; font-size: 10px;)
/desc [?{룰 이름} FanMade Scenario](#" style=" color: #9FBEB4 !important; text-decoration:none; font-style: normal; font-weight: normal; font-size: 10px;)[Written by. ?{라이터 이름}](#" style=" color: #9FBEB4 !important; text-decoration:none; font-style: normal;  font-weight: normal; font-size: 10px; display: block;)
/desc https://imgur.com/csHVgwW.png
/desc [PC](#"style="text-decoration: none; color: #F16A66 !important; font-size: 13px; font-style: normal;)[ ?{PC 이름}](#"style="text-decoration: none; font-size: 13px;  font-style: normal; color: #333;)
/desc [Date](#"style="text-decoration: none; color: #F16A66 !important; font-size: 13px; font-style: normal;)[ ?{날짜}](#"style="text-decoration: none; font-size: 13px;  font-style: normal; color: #333;)
/desc https://imgur.com/braZMf0.png`

export const MULTI_IMAGES = `/desc https://i.imgur.com/zUkx6oV.png
/desc https://i.imgur.com/k5lEBRJ.png
/desc https://i.imgur.com/d2FtVQe.png`

export const MULTI_IMAGE_MACRO = `/desc https://imgur.com/?{선택|
도입,cyTkpDF|
메인,K6NPmsb|
클맥,UWWDimV|
엔딩,MA1BRfc|
----------|
마장열기,VNdeHCm|
마장닫기,HXmP2xJ|
----------|
1사이클,TuHEaN3|
2사이클,r6oUw7n|
3사이클,4xOJas2|
4사이클,XtJsdMs|
5사이클,zURJXqc|
6사이클,8b5QDuv|
7사이클,k0q3oKP|
8사이클,FUkg91m|
9사이클,nSsNVcg|
10사이클,Xr9L7rZ|
----------|
전투개시,bj893Su|
전투종료,mFmZOWj|
}.png`
