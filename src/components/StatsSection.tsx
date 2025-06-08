
export const StatsSection = () => {
  const stats = [
    {
      number: "10,000+",
      label: "Bots Created",
      description: "AI-powered bots built by our community"
    },
    {
      number: "99.9%",
      label: "Uptime",
      description: "Reliable infrastructure for your bots"
    },
    {
      number: "50M+",
      label: "Messages",
      description: "Processed by bots on our platform"
    },
    {
      number: "< 2min",
      label: "Deploy Time",
      description: "From idea to running bot"
    }
  ];

  return (
    <section className="py-20 px-6 bg-gradient-to-br from-gray-50 to-white">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Trusted by developers worldwide
          </h2>
          <p className="text-lg text-gray-600">
            Join the growing community of bot creators
          </p>
        </div>
        
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((stat, index) => (
            <div key={index} className="text-center group">
              <div className="text-4xl lg:text-5xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-2 group-hover:scale-110 transition-transform duration-300">
                {stat.number}
              </div>
              <div className="text-lg font-semibold text-gray-900 mb-1">
                {stat.label}
              </div>
              <div className="text-sm text-gray-600">
                {stat.description}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
