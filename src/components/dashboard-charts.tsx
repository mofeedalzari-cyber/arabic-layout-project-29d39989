import {
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
  PieChart,
  Pie,
  Sector,
} from "recharts";
import { useState } from "react";
import { fmtMoney } from "@/lib/format";

type PkgRow = {
  network: string;
  pkg: string;
  total: number;
  sold: number;
  withdrawn: number;
  remaining: number;
  value: number;
  currency?: string;
};

const COLORS = {
  sold: "var(--primary)",
  withdrawn: "var(--success, var(--primary))",
  remaining: "var(--warning)",
};

export function PackagesChart({ data }: { data: PkgRow[] }) {
  if (!data.length) {
    return (
      <div className="text-center text-sm text-muted-foreground py-10">
        لا توجد بيانات.
      </div>
    );
  }

  return (
    <div dir="rtl">

      <div className="flex flex-wrap justify-center gap-4 mb-4 text-xs">
        <LegendChip color={COLORS.sold} label="المباع" />
        <LegendChip color={COLORS.withdrawn} label="المسحوب" />
        <LegendChip color={COLORS.remaining} label="المتبقي" />
      </div>


      <div
        className="
        grid 
        grid-cols-1 
        sm:grid-cols-2 
        xl:grid-cols-3 
        gap-4
        w-full
        "
      >

        {data.map((r, idx) => {

          const total =
            r.total ||
            r.sold +
            r.withdrawn +
            r.remaining;


          const slices = [
            {
              name: "المباع",
              value: r.sold,
              color: COLORS.sold,
            },
            {
              name: "المسحوب",
              value: r.withdrawn,
              color: COLORS.withdrawn,
            },
            {
              name: "المتبقي",
              value: r.remaining,
              color: COLORS.remaining,
            },
          ];


          return (

            <div
              key={idx}
              className="
              w-full
              rounded-2xl
              border
              border-border/60
              bg-card/50
              p-3
              "
            >

              <div className="text-center mb-2">

                <div className="
                text-sm 
                font-bold 
                truncate
                ">
                  {r.pkg}
                </div>


                <div className="
                text-[10px]
                text-muted-foreground
                truncate
                ">
                  {r.network}
                </div>

              </div>



              <div
                className="w-full h-[160px]"
                dir="ltr"
              >

                <ResponsiveContainer>

                  <PieChart>


                    <defs>

                      {slices.map((s,i)=>(

                        <linearGradient
                          key={i}
                          id={`pkg-gradient-${idx}-${i}`}
                          x1="0"
                          y1="0"
                          x2="1"
                          y2="1"
                        >

                          <stop
                            offset="0%"
                            stopColor={s.color}
                            stopOpacity={1}
                          />

                          <stop
                            offset="100%"
                            stopColor={s.color}
                            stopOpacity={0.5}
                          />

                        </linearGradient>

                      ))}

                    </defs>



                    <Pie

                      data={slices}

                      dataKey="value"

                      nameKey="name"

                      cx="50%"

                      cy="50%"

                      innerRadius="35%"

                      outerRadius="60%"

                      paddingAngle={2}

                      stroke="var(--background)"

                      strokeWidth={2}

                    >


                      {slices.map((_,i)=>(

                        <Cell
                          key={i}
                          fill={
                            `url(#pkg-gradient-${idx}-${i})`
                          }
                        />

                      ))}


                    </Pie>



                    <Tooltip

                      content={({active,payload}:any)=>{

                        if(!active || !payload?.length)
                          return null;


                        const p=payload[0];


                        const pct =
                          total
                          ?
                          Math.round(
                            (Number(p.value)/total)*100
                          )
                          :
                          0;



                        return (

                          <div
                            className="
                            rounded-xl
                            border
                            bg-background/95
                            px-3
                            py-2
                            shadow-lg
                            text-xs
                            "
                            dir="rtl"
                          >

                            <div className="font-bold">
                              {p.name}
                            </div>


                            <div className="text-muted-foreground">

                              العدد:
                              <b className="text-foreground mr-1">
                                {p.value}
                              </b>

                              ({pct}%)

                            </div>

                          </div>

                        );

                      }}

                    />

                  </PieChart>


                </ResponsiveContainer>

              </div>



              <div className="
              grid 
              grid-cols-3 
              gap-2 
              mt-3
              text-center
              text-xs
              ">


                <MiniStat
                  label="مباع"
                  value={r.sold}
                  color={COLORS.sold}
                />


                <MiniStat
                  label="مسحوب"
                  value={r.withdrawn}
                  color={COLORS.withdrawn}
                />


                <MiniStat
                  label="متبقي"
                  value={r.remaining}
                  color={COLORS.remaining}
                />


              </div>


            </div>

          );

        })}

      </div>

    </div>
  );
}





export function AgentsChart({

  totals,

}:{

  totals:{
    withdrawn:number;
    sold:number;
    remaining:number;
  }

}){


const [activeIndex,setActiveIndex]=useState<number>();


const data=[

{
name:"المسحوب (لدى المناديب)",
value:totals.withdrawn,
color:COLORS.sold
},

{
name:"المباع",
value:totals.sold,
color:COLORS.withdrawn
},

{
name:"المتبقي",
value:totals.remaining,
color:COLORS.remaining
}

];


const total=data.reduce(
(sum,item)=>sum+item.value,
0
);



if(!total){

return (

<div className="text-center text-sm text-muted-foreground py-10">

لا توجد بيانات.

</div>

);

}



const renderActive=(props:any)=>{

const {
cx,
cy,
innerRadius,
outerRadius,
startAngle,
endAngle,
fill

}=props;


return (

<Sector

cx={cx}

cy={cy}

innerRadius={innerRadius}

outerRadius={outerRadius+8}

startAngle={startAngle}

endAngle={endAngle}

fill={fill}

/>

);

};



return (

<div dir="rtl">


<div className="
flex
flex-wrap
justify-center
gap-4
mb-3
text-xs
">

{data.map((d,i)=>(

<LegendChip
key={i}
color={d.color}
label={`${d.name}: ${d.value}`}
/>

))}


</div>



<div
className="
w-full
h-[260px]
sm:h-[300px]
"
dir="ltr"
>


<ResponsiveContainer>


<PieChart>


<Pie

data={data}

dataKey="value"

nameKey="name"

cx="50%"

cy="50%"

innerRadius="35%"

outerRadius="65%"

activeIndex={activeIndex}

activeShape={renderActive}

onMouseEnter={(_,i)=>setActiveIndex(i)}

onMouseLeave={()=>setActiveIndex(undefined)}

>


{data.map((d,i)=>(

<Cell

key={i}

fill={d.color}

/>

))}


<LabelList

dataKey="value"

position="inside"

formatter={(v:any)=>{

const n=Number(v);

if(!n)return "";

return `${n} (${Math.round((n/total)*100)}%)`;

}}

/>


</Pie>


<Tooltip/>


</PieChart>


</ResponsiveContainer>


</div>


</div>

);

}






function MiniStat({

label,
value,
color

}:{

label:string;
value:number;
color:string;

}){


return (

<div className="
rounded-lg
bg-muted/40
py-1
">

<div

className="font-bold"

style={{
color
}}

>

{value}

</div>


<div className="text-muted-foreground">

{label}

</div>


</div>

);

}






function LegendChip({

color,
label

}:{

color:string;
label:string;

}){


return (

<div className="
inline-flex
items-center
gap-1.5
">


<span

className="
h-2.5
w-2.5
rounded-full
"

style={{
background:color
}}

/>


<span className="text-muted-foreground">

{label}

</span>


</div>

);

}
