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



export function PackagesChart({
  data,
}: {
  data: PkgRow[];
}) {

  if (!data.length) {
    return (
      <div className="
      text-center 
      text-sm 
      text-muted-foreground 
      py-10
      ">
        لا توجد بيانات.
      </div>
    );
  }



  return (

    <div
      className="
      rounded-2xl
      border
      border-border/60
      bg-card/50
      p-3
      w-full
      "
      dir="rtl"
    >


      {/* العنوان */}

      <div className="
      flex
      justify-between
      items-center
      mb-3
      ">

        <h3 className="
        font-bold
        text-sm
        ">
          إحصائيات الباقات
        </h3>


        <div className="
        text-xs
        text-muted-foreground
        ">
          {data.length} باقة
        </div>


      </div>



      {/* المفتاح */}

      <div className="
      flex
      flex-wrap
      gap-3
      mb-3
      text-[11px]
      ">


        <LegendChip
          color={COLORS.sold}
          label="المباع"
        />


        <LegendChip
          color={COLORS.withdrawn}
          label="المسحوب"
        />


        <LegendChip
          color={COLORS.remaining}
          label="المتبقي"
        />


      </div>




      {/* الباقات */}


      <div className="
      divide-y
      divide-border/60
      ">


        {data.map((r,index)=>{


          const total =
            r.total ||
            r.sold +
            r.withdrawn +
            r.remaining;



          const soldPercent =
            total
            ? Math.round((r.sold / total) * 100)
            : 0;


          const withdrawnPercent =
            total
            ? Math.round((r.withdrawn / total) * 100)
            : 0;


          const remainingPercent =
            total
            ? Math.round((r.remaining / total) * 100)
            : 0;



          return (


            <div
              key={index}
              className="
              py-3
              "
            >


              {/* اسم الباقة */}


              <div className="
              flex
              justify-between
              items-center
              mb-2
              ">


                <div>

                  <div className="
                  font-bold
                  text-sm
                  ">
                    {r.pkg}
                  </div>


                  <div className="
                  text-[11px]
                  text-muted-foreground
                  ">
                    {r.network}
                  </div>


                </div>



                <div className="
                text-xs
                font-bold
                ">
                  {fmtMoney(r.value)}
                </div>


              </div>




              {/* الأرقام */}


              <div className="
              grid
              grid-cols-3
              gap-2
              text-center
              text-[11px]
              ">


                <div className="
                rounded-lg
                bg-muted/40
                py-2
                ">

                  <div
                    className="font-bold"
                    style={{
                      color: COLORS.sold
                    }}
                  >
                    {r.sold}
                  </div>


                  <div>
                    مباع
                  </div>

                  <div className="
                  text-[10px]
                  text-muted-foreground
                  ">
                    {soldPercent}%
                  </div>


                </div>





                <div className="
                rounded-lg
                bg-muted/40
                py-2
                ">


                  <div
                    className="font-bold"
                    style={{
                      color: COLORS.withdrawn
                    }}
                  >
                    {r.withdrawn}
                  </div>


                  <div>
                    مسحوب
                  </div>


                  <div className="
                  text-[10px]
                  text-muted-foreground
                  ">
                    {withdrawnPercent}%
                  </div>


                </div>






                <div className="
                rounded-lg
                bg-muted/40
                py-2
                ">


                  <div
                    className="font-bold"
                    style={{
                      color: COLORS.remaining
                    }}
                  >
                    {r.remaining}
                  </div>


                  <div>
                    متبقي
                  </div>


                  <div className="
                  text-[10px]
                  text-muted-foreground
                  ">
                    {remainingPercent}%
                  </div>


                </div>



              </div>





              {/* شريط النسبة */}


              <div className="
              mt-3
              h-2
              rounded-full
              overflow-hidden
              bg-muted
              flex
              ">


                <div
                  style={{
                    width:`${soldPercent}%`,
                    background:COLORS.sold
                  }}
                />


                <div
                  style={{
                    width:`${withdrawnPercent}%`,
                    background:COLORS.withdrawn
                  }}
                />


                <div
                  style={{
                    width:`${remainingPercent}%`,
                    background:COLORS.remaining
                  }}
                />


              </div>



            </div>


          );


        })}


      </div>


    </div>

  );

}





function LegendChip({
  color,
  label,
}:{
  color:string;
  label:string;
}) {


  return (

    <div className="
    inline-flex
    items-center
    gap-1
    ">

      <span
        className="
        w-2
        h-2
        rounded-full
        "
        style={{
          background:color
        }}
      />


      <span className="
      text-muted-foreground
      ">
        {label}
      </span>


    </div>

  );

}
